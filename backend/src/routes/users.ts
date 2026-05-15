import { Router } from "express";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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
        orgId:  req.user!.orgId,
      }
    );
  })
);

// GET /users  (admin/manager only) — scoped to caller's org
router.get(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: config.tables.users,
        IndexName: config.indexes.usersOrg,
        KeyConditionExpression: "orgId = :o",
        ExpressionAttributeValues: { ":o": req.user!.orgId },
      })
    );
    res.json((Items ?? []).filter((u) => !u.deletedAt));
  })
);

// POST /users — creates Cognito account + DynamoDB profile in caller's org.
// Admin can create managers or employees. Manager can create employees only.
router.post(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, teamId } = req.body ?? {};
    const caller = req.user!;

    if (!email || !role) throw new HttpError(400, "email and role are required");
    if (!["manager", "employee"].includes(role)) {
      throw new HttpError(400, "Invalid role (must be manager or employee)");
    }
    if (caller.role === "manager" && role !== "employee") {
      throw new HttpError(403, "Managers can only create employees");
    }
    if (role === "employee" && !teamId) {
      throw new HttpError(400, "teamId is required for employees");
    }

    // Verify the team belongs to the caller's org.
    if (teamId) {
      const { Item: team } = await ddb.send(
        new GetCommand({ TableName: config.tables.teams, Key: { teamId } })
      );
      if (!team || team.orgId !== caller.orgId) {
        throw new HttpError(404, "Team not found");
      }
    }

    let cognitoSub: string;
    try {
      const createRes = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: config.cognito.userPoolId,
          Username: email,
          TemporaryPassword: password || "Syncora@2026!",
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email",            Value: email },
            { Name: "email_verified",   Value: "true" },
            { Name: "name",             Value: name ?? email.split("@")[0] },
            { Name: "custom:role",      Value: role },
            { Name: "custom:teamId",    Value: role === "employee" ? (teamId ?? "") : "" },
            { Name: "custom:orgId",     Value: caller.orgId },
          ],
        })
      );

      const sub = createRes.User?.Attributes?.find(a => a.Name === "sub")?.Value;
      if (!sub) throw new Error("Cognito did not return a sub");
      cognitoSub = sub;

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

    const item = {
      userId:    cognitoSub,
      email,
      name:      name ?? email.split("@")[0],
      role,
      teamId:    role === "employee" ? (teamId ?? "") : "",
      orgId:     caller.orgId,
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: config.tables.users, Item: item }));

    res.status(201).json(item);
  })
);

// PUT /users/:id — admin/manager can update profile within their org.
router.put(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { teamId, role, name } = req.body ?? {};
    const userId = req.params.id;
    const caller = req.user!;

    // Org-boundary check + role-change rules.
    const { Item: target } = await ddb.send(
      new GetCommand({ TableName: config.tables.users, Key: { userId } })
    );
    if (!target || target.orgId !== caller.orgId) {
      throw new HttpError(404, "User not found");
    }
    if (target.role === "admin" && caller.sub !== target.userId) {
      throw new HttpError(403, "Cannot modify the organization admin");
    }
    if (caller.role === "manager" && target.role !== "employee") {
      throw new HttpError(403, "Managers can only modify employees");
    }
    if (role !== undefined) {
      if (!["manager", "employee"].includes(role)) {
        throw new HttpError(400, "Invalid role (must be manager or employee)");
      }
      if (caller.role === "manager") {
        throw new HttpError(403, "Managers cannot change roles");
      }
    }
    if (teamId !== undefined && teamId) {
      const { Item: team } = await ddb.send(
        new GetCommand({ TableName: config.tables.teams, Key: { teamId } })
      );
      if (!team || team.orgId !== caller.orgId) {
        throw new HttpError(404, "Team not found");
      }
    }

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

// DELETE /users/:id — soft-delete the profile and disable the Cognito account.
// Org-scoped; the org admin cannot be removed.
router.delete(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const userId = req.params.id;
    const caller = req.user!;

    const { Item: target } = await ddb.send(
      new GetCommand({ TableName: config.tables.users, Key: { userId } })
    );
    if (!target || target.orgId !== caller.orgId) {
      throw new HttpError(404, "User not found");
    }
    if (target.role === "admin") {
      throw new HttpError(403, "Cannot delete the organization admin");
    }
    if (caller.role === "manager" && target.role !== "employee") {
      throw new HttpError(403, "Managers can only delete employees");
    }

    await ddb.send(
      new UpdateCommand({
        TableName: config.tables.users,
        Key: { userId },
        UpdateExpression: "SET deletedAt = :now",
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
        ConditionExpression: "attribute_exists(userId)",
      })
    );

    if (target.email) {
      try {
        await cognito.send(
          new AdminDisableUserCommand({
            UserPoolId: config.cognito.userPoolId,
            Username: target.email as string,
          })
        );
      } catch {
        // Cognito sync failure is non-fatal — DynamoDB is source of truth for the app
      }
    }

    res.status(204).send();
  })
);

export default router;
