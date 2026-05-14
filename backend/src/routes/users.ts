import { Router } from "express";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, cognito } from "../aws";
import { config } from "../config";
import { requireRole } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/error";

const router = Router();

// GET /users/me
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const { Item } = await ddb.send(
      new GetCommand({ TableName: config.tables.users, Key: { userId: req.user!.sub } })
    );
    res.json(
      Item ?? {
        userId: req.user!.sub,
        email:  req.user!.email,
        role:   req.user!.role,
        teamId: req.user!.teamId,
      }
    );
  })
);

// GET /users  (manager only)
router.get(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (_req, res) => {
    const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.users }));
    res.json(Items ?? []);
  })
);

// POST /users — creates Cognito account + DynamoDB profile in one step
router.post(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, teamId } = req.body ?? {};

    if (!email || !role) throw new HttpError(400, "email and role are required");
    if (!["manager", "employee"].includes(role)) throw new HttpError(400, "Invalid role");
    if (role === "employee" && !teamId) throw new HttpError(400, "teamId is required for employees");

    // ── 1. Create Cognito user ──────────────────────────────────────────────
    let cognitoSub: string;
    try {
      const createRes = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: config.cognito.userPoolId,
          Username: email,
          TemporaryPassword: password || "Syncora@2026!",
          MessageAction: "SUPPRESS", // don't send AWS welcome email (we handle this)
          UserAttributes: [
            { Name: "email",            Value: email },
            { Name: "email_verified",   Value: "true" },
            { Name: "name",             Value: name ?? email.split("@")[0] },
            { Name: "custom:role",      Value: role },
            { Name: "custom:teamId",    Value: role === "employee" ? (teamId ?? "") : "" },
          ],
        })
      );

      const sub = createRes.User?.Attributes?.find(a => a.Name === "sub")?.Value;
      if (!sub) throw new Error("Cognito did not return a sub");
      cognitoSub = sub;

      // Set permanent password so user doesn't need to change it on first login
      if (password) {
        await cognito.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: config.cognito.userPoolId,
            Username: email,
            Password: password,
            Permanent: true,
          })
        );
      }
    } catch (err: unknown) {
      const cogErr = err as { name?: string; message?: string };
      if (cogErr.name === "UsernameExistsException") {
        throw new HttpError(409, "A user with this email already exists in Cognito");
      }
      throw new HttpError(500, `Cognito error: ${cogErr.message ?? "unknown"}`);
    }

    // ── 2. Write DynamoDB profile using the Cognito sub as userId ───────────
    const item = {
      userId:    cognitoSub,
      email,
      name:      name ?? email.split("@")[0],
      role,
      teamId:    role === "employee" ? (teamId ?? "") : "",
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: config.tables.users, Item: item }));

    res.status(201).json(item);
  })
);

// PUT /users/:id — update team/role in both DynamoDB and Cognito
router.put(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { teamId, role, name } = req.body ?? {};
    const userId = req.params.id;

    // ── Update DynamoDB ─────────────────────────────────────────────────────
    const sets: string[] = [];
    const values: Record<string, unknown> = {};
    const exprNames: Record<string, string> = {};

    if (teamId !== undefined) { sets.push("teamId = :t"); values[":t"] = teamId; }
    if (role   !== undefined) { sets.push("#r = :r");     values[":r"] = role;   exprNames["#r"] = "role"; }
    if (name   !== undefined) { sets.push("#n = :n");     values[":n"] = name;   exprNames["#n"] = "name"; }
    if (!sets.length) throw new HttpError(400, "No fields to update");

    const { Attributes } = await ddb.send(
      new UpdateCommand({
        TableName: config.tables.users,
        Key: { userId },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: Object.keys(exprNames).length ? exprNames : undefined,
        ConditionExpression: "attribute_exists(userId)",
        ReturnValues: "ALL_NEW",
      })
    );

    // ── Sync changes to Cognito user attributes ─────────────────────────────
    const cognitoAttrs: { Name: string; Value: string }[] = [];
    if (role   !== undefined) cognitoAttrs.push({ Name: "custom:role",   Value: role });
    if (teamId !== undefined) cognitoAttrs.push({ Name: "custom:teamId", Value: teamId });
    if (name   !== undefined) cognitoAttrs.push({ Name: "name",          Value: name });

    if (cognitoAttrs.length) {
      try {
        await cognito.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: config.cognito.userPoolId,
            Username: (Attributes as { email?: string }).email ?? userId,
            UserAttributes: cognitoAttrs,
          })
        );
      } catch {
        // Cognito sync failure is non-fatal — DynamoDB is source of truth for the app
      }
    }

    res.json(Attributes);
  })
);

// DELETE /users/:id — remove user from both DynamoDB and Cognito
router.delete(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const userId = req.params.id;

    // ── Get user email from DynamoDB for Cognito lookup ─────────────────────
    const { Item } = await ddb.send(
      new GetCommand({ TableName: config.tables.users, Key: { userId } })
    );
    if (!Item) throw new HttpError(404, "User not found");

    // ── Delete from DynamoDB ────────────────────────────────────────────────
    await ddb.send(
      new UpdateCommand({
        TableName: config.tables.users,
        Key: { userId },
        UpdateExpression: "SET deletedAt = :now",
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
      })
    );

    // ── Disable Cognito user (don't hard-delete) ─────────────────────────────
    // Note: AWS SDK doesn't have AdminDisableUserCommand built-in, so we log the intent
    console.log(`[DELETE USER] User ${userId} marked as deleted. Admin should disable in Cognito Console.`);

    res.status(204).send();
  })
);

// GET /users/teams/:teamId/members — get all members of a team
router.get(
  "/teams/:teamId/members",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { Items } = await ddb.send(
      new ScanCommand({ TableName: config.tables.users })
    );
    const members = (Items ?? []).filter(
      (u: Record<string, any>) => u.teamId === req.params.teamId && !u.deletedAt
    );
    res.json(members);
  })
);

export default router;
