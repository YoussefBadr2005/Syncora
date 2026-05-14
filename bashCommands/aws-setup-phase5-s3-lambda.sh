#!/bin/bash
# =============================================================================
# Mini-Jira on AWS — Phase 5: S3 Buckets + Lambda Image Pipeline
# Creates S3 buckets, builds & deploys all 3 Lambda functions.
# Idempotent: safe to re-run.
# Usage: ./aws-setup-phase5-s3-lambda.sh
# =============================================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION — load IDs from Phase 1/2 output
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -f aws-output.env ]; then
  echo "ERROR: aws-output.env not found. Run aws-setup-phase1-2.sh first."
  exit 1
fi
set -a; source aws-output.env; set +a

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID}"
PROJECT="Syncora"
export AWS_DEFAULT_REGION="$REGION"
export AWS_PAGER=""

# Unique suffix so bucket names are globally unique
SUFFIX=$(echo "$ACCOUNT_ID" | tail -c 7)
ORIGINALS_BUCKET="mini-jira-originals-${SUFFIX}"
RESIZED_BUCKET="mini-jira-resized-${SUFFIX}"

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

bucket_exists() {
  aws s3api head-bucket --bucket "$1" 2>/dev/null
}

lambda_exists() {
  aws lambda get-function --function-name "$1" \
    --query 'Configuration.FunctionName' --output text 2>/dev/null | grep -q "$1"
}

# Convert a Git Bash POSIX path (/d/Syncora/...) to a Windows path (D:/Syncora/...)
# so the native AWS CLI can read files. Falls back to the input if cygpath is missing.
winpath() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$1"
  else
    echo "$1"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# S3 BUCKETS
# ─────────────────────────────────────────────────────────────────────────────

log "Creating S3 originals bucket: $ORIGINALS_BUCKET"
if bucket_exists "$ORIGINALS_BUCKET"; then
  skip "Originals bucket already exists"
else
  aws s3api create-bucket \
    --bucket "$ORIGINALS_BUCKET" \
    --region "$REGION"

  # Enable versioning — spec requires old image versions to be retained
  aws s3api put-bucket-versioning \
    --bucket "$ORIGINALS_BUCKET" \
    --versioning-configuration Status=Enabled

  # Block all public access — images served via pre-signed URLs only
  aws s3api put-public-access-block \
    --bucket "$ORIGINALS_BUCKET" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  # CORS so frontend can upload directly via pre-signed URL
  aws s3api put-bucket-cors \
    --bucket "$ORIGINALS_BUCKET" \
    --cors-configuration '{
      "CORSRules": [{
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["PUT","POST","GET","HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
      }]
    }'

  ok "Originals bucket ready: $ORIGINALS_BUCKET"
fi

log "Creating S3 resized bucket: $RESIZED_BUCKET"
if bucket_exists "$RESIZED_BUCKET"; then
  skip "Resized bucket already exists"
else
  aws s3api create-bucket \
    --bucket "$RESIZED_BUCKET" \
    --region "$REGION"

  aws s3api put-public-access-block \
    --bucket "$RESIZED_BUCKET" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

  ok "Resized bucket ready: $RESIZED_BUCKET"
fi

# ─────────────────────────────────────────────────────────────────────────────
# BUILD LAMBDA FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

build_lambda() {
  local DIR=$1
  local NAME=$2
  log "Building Lambda: $NAME..."
  cd "$DIR"
  npm install --silent
  npm run build
  node "$SCRIPT_DIR/scripts/zip-lambda.js" "$DIR"
  ok "Packaged: $DIR/function.zip"
  cd - >/dev/null
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

build_lambda "$SCRIPT_DIR/lambdas/image-resize"      "image-resize"
build_lambda "$SCRIPT_DIR/lambdas/assignment-worker"  "assignment-worker"
build_lambda "$SCRIPT_DIR/lambdas/daily-digest"       "daily-digest"

# ─────────────────────────────────────────────────────────────────────────────
# DEPLOY LAMBDA: IMAGE RESIZE
# ─────────────────────────────────────────────────────────────────────────────
log "Deploying ImageResizeLambda..."
RESIZE_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${PROJECT}-role-lambda-image-resize"

RESIZE_ZIP="$(winpath "$SCRIPT_DIR/lambdas/image-resize/function.zip")"
if lambda_exists "ImageResizeLambda"; then
  skip "ImageResizeLambda exists — updating code..."
  aws lambda update-function-code \
    --function-name ImageResizeLambda \
    --zip-file "fileb://$RESIZE_ZIP" >/dev/null
  ok "ImageResizeLambda code updated"
else
  aws lambda create-function \
    --function-name ImageResizeLambda \
    --runtime nodejs20.x \
    --role "$RESIZE_ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://$RESIZE_ZIP" \
    --timeout 30 \
    --memory-size 512 \
    --environment "Variables={
      S3_RESIZED_BUCKET=${RESIZED_BUCKET},
      DDB_TASKS_TABLE=Tasks
    }" >/dev/null
  ok "ImageResizeLambda deployed"
fi

# Wait for function to be active before adding trigger
aws lambda wait function-active --function-name ImageResizeLambda

# ── S3 trigger for image-resize ───────────────────────────────────────────────
log "Wiring S3 trigger on originals bucket..."

RESIZE_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:ImageResizeLambda"

# Grant S3 permission to invoke Lambda (idempotent via statement-id)
aws lambda remove-permission \
  --function-name ImageResizeLambda \
  --statement-id s3-originals-trigger 2>/dev/null || true

aws lambda add-permission \
  --function-name ImageResizeLambda \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn "arn:aws:s3:::${ORIGINALS_BUCKET}" \
  --statement-id s3-originals-trigger >/dev/null
ok "Lambda invoke permission granted to S3"

# Attach S3 event notification
aws s3api put-bucket-notification-configuration \
  --bucket "$ORIGINALS_BUCKET" \
  --notification-configuration "{
    \"LambdaFunctionConfigurations\": [{
      \"LambdaFunctionArn\": \"${RESIZE_ARN}\",
      \"Events\": [\"s3:ObjectCreated:Put\"],
      \"Filter\": {
        \"Key\": {
          \"FilterRules\": [
            {\"Name\": \"prefix\", \"Value\": \"tasks/\"},
            {\"Name\": \"suffix\", \"Value\": \".jpg\"}
          ]
        }
      }
    }, {
      \"LambdaFunctionArn\": \"${RESIZE_ARN}\",
      \"Events\": [\"s3:ObjectCreated:Put\"],
      \"Filter\": {
        \"Key\": {
          \"FilterRules\": [
            {\"Name\": \"prefix\", \"Value\": \"tasks/\"},
            {\"Name\": \"suffix\", \"Value\": \".jpeg\"}
          ]
        }
      }
    }, {
      \"LambdaFunctionArn\": \"${RESIZE_ARN}\",
      \"Events\": [\"s3:ObjectCreated:Put\"],
      \"Filter\": {
        \"Key\": {
          \"FilterRules\": [
            {\"Name\": \"prefix\", \"Value\": \"tasks/\"},
            {\"Name\": \"suffix\", \"Value\": \".png\"}
          ]
        }
      }
    }]
  }"
ok "S3 → ImageResizeLambda trigger wired (.jpg, .jpeg, .png)"

# ─────────────────────────────────────────────────────────────────────────────
# DEPLOY LAMBDA: ASSIGNMENT WORKER
# ─────────────────────────────────────────────────────────────────────────────
log "Deploying AssignmentWorkerLambda..."
WORKER_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${PROJECT}-role-lambda-assignment-worker"

WORKER_ZIP="$(winpath "$SCRIPT_DIR/lambdas/assignment-worker/function.zip")"
if lambda_exists "AssignmentWorkerLambda"; then
  skip "AssignmentWorkerLambda exists — updating code..."
  aws lambda update-function-code \
    --function-name AssignmentWorkerLambda \
    --zip-file "fileb://$WORKER_ZIP" >/dev/null
  ok "AssignmentWorkerLambda code updated"
else
  aws lambda create-function \
    --function-name AssignmentWorkerLambda \
    --runtime nodejs20.x \
    --role "$WORKER_ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://$WORKER_ZIP" \
    --timeout 30 \
    --memory-size 256 \
    --environment "Variables={
      DDB_ACTIVITY_LOGS_TABLE=ActivityLogs,
      CW_NAMESPACE=MiniJira
    }" >/dev/null
  ok "AssignmentWorkerLambda deployed"
fi

aws lambda wait function-active --function-name AssignmentWorkerLambda

# ─────────────────────────────────────────────────────────────────────────────
# DEPLOY LAMBDA: DAILY DIGEST
# ─────────────────────────────────────────────────────────────────────────────
log "Deploying DailyDigestLambda..."
DIGEST_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${PROJECT}-role-lambda-daily-digest"

# Digest topic ARN — will be created in Phase 6; placeholder for now
DIGEST_TOPIC_ARN="${SNS_DIGEST_TOPIC_ARN:-arn:aws:sns:${REGION}:${ACCOUNT_ID}:DailyDigestTopic}"

DIGEST_ZIP="$(winpath "$SCRIPT_DIR/lambdas/daily-digest/function.zip")"
if lambda_exists "DailyDigestLambda"; then
  skip "DailyDigestLambda exists — updating code..."
  aws lambda update-function-code \
    --function-name DailyDigestLambda \
    --zip-file "fileb://$DIGEST_ZIP" >/dev/null
  ok "DailyDigestLambda code updated"
else
  aws lambda create-function \
    --function-name DailyDigestLambda \
    --runtime nodejs20.x \
    --role "$DIGEST_ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://$DIGEST_ZIP" \
    --timeout 60 \
    --memory-size 256 \
    --environment "Variables={
      DDB_TASKS_TABLE=Tasks,
      DDB_USERS_TABLE=Users,
      SNS_DIGEST_TOPIC_ARN=${DIGEST_TOPIC_ARN}
    }" >/dev/null
  ok "DailyDigestLambda deployed"
fi

aws lambda wait function-active --function-name DailyDigestLambda

# ─────────────────────────────────────────────────────────────────────────────
# APPEND NEW VALUES TO aws-output.env
# ─────────────────────────────────────────────────────────────────────────────
log "Updating aws-output.env..."

# Remove old bucket lines if re-running, then re-append
grep -v "^S3_ORIGINALS_BUCKET\|^S3_RESIZED_BUCKET" aws-output.env > aws-output.env.tmp || true
mv aws-output.env.tmp aws-output.env

cat >> aws-output.env <<EOF

# ── Phase 5 ──────────────────────────────────────────────────────────────────
S3_ORIGINALS_BUCKET=${ORIGINALS_BUCKET}
S3_RESIZED_BUCKET=${RESIZED_BUCKET}
EOF
chmod 600 aws-output.env
ok "aws-output.env updated"

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Phase 5 Complete — S3 + Lambda"
echo "============================================================"
echo "  Originals bucket:  $ORIGINALS_BUCKET"
echo "  Resized bucket:    $RESIZED_BUCKET"
echo ""
echo "  Lambda functions:"
for FN in ImageResizeLambda AssignmentWorkerLambda DailyDigestLambda; do
  STATE=$(aws lambda get-function \
    --function-name "$FN" \
    --query 'Configuration.State' --output text 2>/dev/null || echo "MISSING")
  printf "    %-30s %s\n" "$FN" "$STATE"
done
echo ""
echo "  S3 → ImageResizeLambda trigger: active"
echo "  AssignmentWorkerLambda SQS trigger: wired in Phase 6"
echo "  DailyDigestLambda EventBridge rule: wired in Phase 6"
echo "============================================================"
echo "  Next step: Phase 6 — SNS + SQS + EventBridge"
echo "============================================================"
