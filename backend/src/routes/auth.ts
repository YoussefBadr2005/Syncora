import { Router } from "express";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb, cognito } from "../aws";
import { config } from "../config";
import { asyncHandler, HttpError } from "../middleware/error";

const router = Router();

// POST /auth/register-organization
// Public endpoint. Creates an Organization plus its root admin user in one flow.
// This is the ONLY public account-creation endpoint. All subsequent users
// (employees) must be created by an authenticated manager via /users.
router.post(
  "/register-organization",
  asyncHandler(async (req, res) => {
    const { organizationName, adminName, adminEmail, password } = req.body ?? {};

    if (!organizationName || !adminEmail || !password) {
      throw new HttpError(400, "organizationName, adminEmail, and password are required");
    }
    if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");

    const orgId = uuid();
    const resolvedName = adminName ?? adminEmail.split("@")[0];

    let cognitoSub: string | undefined;
    try {
      const createRes = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: config.cognito.userPoolId,
          Username: adminEmail,
          TemporaryPassword: password,
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email",          Value: adminEmail },
            { Name: "email_verified", Value: "true" },
            { Name: "name",           Value: resolvedName },
            { Name: "custom:role",    Value: "manager" },
            { Name: "custom:teamId",  Value: "" },
            { Name: "custom:orgId",   Value: orgId },
          ],
        })
      );

      const sub = createRes.User?.Attributes?.find(a => a.Name === "sub")?.Value;
      if (!sub) throw new Error("Cognito did not return a sub");
      cognitoSub = sub;

      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: config.cognito.userPoolId,
          Username: adminEmail,
          Password: password,
          Permanent: true,
        })
      );
    } catch (err: unknown) {
      const cogErr = err as { name?: string; message?: string };
      if (cogErr.name === "UsernameExistsException") {
        throw new HttpError(409, "An account with this email already exists");
      }
      if (cogErr.name === "InvalidPasswordException") {
        throw new HttpError(400, cogErr.message ?? "Password does not meet requirements");
      }
      throw new HttpError(500, `Registration error: ${cogErr.message ?? "unknown"}`);
    }

    const now = new Date().toISOString();
    try {
      await ddb.send(
        new PutCommand({
          TableName: config.tables.organizations,
          Item: { orgId, name: organizationName, ownerUserId: cognitoSub, createdAt: now },
        })
      );
      await ddb.send(
        new PutCommand({
          TableName: config.tables.users,
          Item: {
            userId:    cognitoSub,
            email:     adminEmail,
            name:      resolvedName,
            role:      "manager",
            teamId:    "",
            orgId,
            createdAt: now,
          },
        })
      );
    } catch (err) {
      // Roll back the orphaned Cognito user so the email can be reused.
      try {
        await cognito.send(
          new AdminDeleteUserCommand({
            UserPoolId: config.cognito.userPoolId,
            Username: adminEmail,
          })
        );
      } catch {
        // best-effort rollback
      }
      throw new HttpError(500, `Failed to persist organization: ${(err as Error).message}`);
    }

    res.status(201).json({
      message: "Organization created. You can now sign in as the manager.",
      orgId,
      managerUserId: cognitoSub,
    });
  })
);

export default router;
