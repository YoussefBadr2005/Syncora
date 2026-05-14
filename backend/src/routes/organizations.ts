import { Router } from "express";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../aws";
import { config } from "../config";
import { asyncHandler, HttpError } from "../middleware/error";

const router = Router();

// GET /organizations/me — return the caller's organization
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: config.tables.organizations,
        Key: { orgId: req.user!.orgId },
      })
    );
    if (!Item) throw new HttpError(404, "Organization not found");
    res.json(Item);
  })
);

export default router;
