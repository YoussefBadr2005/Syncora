#!/bin/bash
# =============================================================================
# Mini-Jira on AWS — Phase 4: DynamoDB Tables
# Creates all 7 tables with correct keys and GSIs.
# Idempotent: safe to re-run (skips tables that already exist).
# Usage: chmod +x aws-setup-phase4-dynamo.sh && ./aws-setup-phase4-dynamo.sh
# =============================================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
REGION="us-east-1"
export AWS_DEFAULT_REGION="$REGION"
export AWS_PAGER=""

# Billing mode: PAY_PER_REQUEST (on-demand, no capacity planning, stays in free tier)
BILLING="PAY_PER_REQUEST"

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

table_exists() {
  aws dynamodb describe-table --table-name "$1" \
    --query 'Table.TableName' --output text 2>/dev/null | grep -q "$1"
}

wait_active() {
  echo "  Waiting for $1 to become ACTIVE..."
  aws dynamodb wait table-exists --table-name "$1"
  ok "$1 is ACTIVE"
}

# ─────────────────────────────────────────────────────────────────────────────
# TABLES
# ─────────────────────────────────────────────────────────────────────────────

# ── Users ─────────────────────────────────────────────────────────────────────
# PK: userId (Cognito sub)
log "Users table..."
if table_exists Users; then
  skip "Users already exists"
else
  aws dynamodb create-table \
    --table-name Users \
    --attribute-definitions \
      AttributeName=userId,AttributeType=S \
    --key-schema \
      AttributeName=userId,KeyType=HASH \
    --billing-mode $BILLING
  wait_active Users
fi

# ── Teams ─────────────────────────────────────────────────────────────────────
# PK: teamId
log "Teams table..."
if table_exists Teams; then
  skip "Teams already exists"
else
  aws dynamodb create-table \
    --table-name Teams \
    --attribute-definitions \
      AttributeName=teamId,AttributeType=S \
    --key-schema \
      AttributeName=teamId,KeyType=HASH \
    --billing-mode $BILLING
  wait_active Teams
fi

# ── Projects ──────────────────────────────────────────────────────────────────
# PK: projectId
# GSI: teamId-index (teamId) — employees query by their team
log "Projects table..."
if table_exists Projects; then
  skip "Projects already exists"
else
  aws dynamodb create-table \
    --table-name Projects \
    --attribute-definitions \
      AttributeName=projectId,AttributeType=S \
      AttributeName=teamId,AttributeType=S \
    --key-schema \
      AttributeName=projectId,KeyType=HASH \
    --global-secondary-indexes '[
      {
        "IndexName": "teamId-index",
        "KeySchema": [{"AttributeName":"teamId","KeyType":"HASH"}],
        "Projection": {"ProjectionType":"ALL"}
      }
    ]' \
    --billing-mode $BILLING
  wait_active Projects
fi

# ── Tasks ─────────────────────────────────────────────────────────────────────
# PK: taskId  SK: projectId
# GSI 1: teamId-index     — team isolation queries (required by spec)
# GSI 2: assigneeId-index — per-user task queries  (required by spec)
log "Tasks table..."
if table_exists Tasks; then
  skip "Tasks already exists"
else
  aws dynamodb create-table \
    --table-name Tasks \
    --attribute-definitions \
      AttributeName=taskId,AttributeType=S \
      AttributeName=projectId,AttributeType=S \
      AttributeName=teamId,AttributeType=S \
      AttributeName=assigneeId,AttributeType=S \
    --key-schema \
      AttributeName=taskId,KeyType=HASH \
      AttributeName=projectId,KeyType=RANGE \
    --global-secondary-indexes '[
      {
        "IndexName": "teamId-index",
        "KeySchema": [{"AttributeName":"teamId","KeyType":"HASH"}],
        "Projection": {"ProjectionType":"ALL"}
      },
      {
        "IndexName": "assigneeId-index",
        "KeySchema": [{"AttributeName":"assigneeId","KeyType":"HASH"}],
        "Projection": {"ProjectionType":"ALL"}
      }
    ]' \
    --billing-mode $BILLING
  wait_active Tasks
fi

# ── Comments ──────────────────────────────────────────────────────────────────
# PK: commentId  SK: taskId
# GSI: taskId-index — fetch all comments for a task
log "Comments table..."
if table_exists Comments; then
  skip "Comments already exists"
else
  aws dynamodb create-table \
    --table-name Comments \
    --attribute-definitions \
      AttributeName=commentId,AttributeType=S \
      AttributeName=taskId,AttributeType=S \
    --key-schema \
      AttributeName=commentId,KeyType=HASH \
      AttributeName=taskId,KeyType=RANGE \
    --global-secondary-indexes '[
      {
        "IndexName": "taskId-index",
        "KeySchema": [{"AttributeName":"taskId","KeyType":"HASH"}],
        "Projection": {"ProjectionType":"ALL"}
      }
    ]' \
    --billing-mode $BILLING
  wait_active Comments
fi

# ── StatusLogs ────────────────────────────────────────────────────────────────
# PK: logId
# Stores every status transition: who moved it, from/to, when.
log "StatusLogs table..."
if table_exists StatusLogs; then
  skip "StatusLogs already exists"
else
  aws dynamodb create-table \
    --table-name StatusLogs \
    --attribute-definitions \
      AttributeName=logId,AttributeType=S \
    --key-schema \
      AttributeName=logId,KeyType=HASH \
    --billing-mode $BILLING
  wait_active StatusLogs
fi

# ── ActivityLogs ──────────────────────────────────────────────────────────────
# PK: logId
# Written by the Assignment Worker Lambda via SQS.
log "ActivityLogs table..."
if table_exists ActivityLogs; then
  skip "ActivityLogs already exists"
else
  aws dynamodb create-table \
    --table-name ActivityLogs \
    --attribute-definitions \
      AttributeName=logId,AttributeType=S \
    --key-schema \
      AttributeName=logId,KeyType=HASH \
    --billing-mode $BILLING
  wait_active ActivityLogs
fi

# ─────────────────────────────────────────────────────────────────────────────
# SEED: Demo teams so employees are assigned to a real teamId
# ─────────────────────────────────────────────────────────────────────────────
log "Seeding demo teams..."

seed_team() {
  local TEAM_ID=$1
  local NAME=$2
  local EXISTS
  EXISTS=$(aws dynamodb get-item \
    --table-name Teams \
    --key "{\"teamId\":{\"S\":\"$TEAM_ID\"}}" \
    --query 'Item.teamId.S' --output text 2>/dev/null | sed 's/None//')
  if [ -n "$EXISTS" ]; then
    skip "Team $TEAM_ID already seeded"
  else
    aws dynamodb put-item \
      --table-name Teams \
      --item "{
        \"teamId\":{\"S\":\"$TEAM_ID\"},
        \"name\":{\"S\":\"$NAME\"},
        \"memberIds\":{\"L\":[]},
        \"createdAt\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}
      }"
    ok "Seeded team: $TEAM_ID ($NAME)"
  fi
}

seed_team "team-frontend" "Frontend"
seed_team "team-backend"  "Backend"

# ─────────────────────────────────────────────────────────────────────────────
# VERIFY — list all tables and confirm they are ACTIVE
# ─────────────────────────────────────────────────────────────────────────────
log "Verifying all tables..."
aws dynamodb list-tables --query 'TableNames' --output table

echo ""
echo "============================================================"
echo "  Phase 4 Complete — DynamoDB Tables"
echo "============================================================"
for T in Users Teams Projects Tasks Comments StatusLogs ActivityLogs; do
  STATUS=$(aws dynamodb describe-table --table-name $T \
    --query 'Table.TableStatus' --output text 2>/dev/null || echo "MISSING")
  printf "  %-20s %s\n" "$T" "$STATUS"
done
echo "============================================================"
echo "  Next step: Phase 5 — S3 buckets + Lambda image pipeline"
echo "============================================================"
