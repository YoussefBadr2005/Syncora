#!/bin/bash
# =============================================================================
# Mini-Jira on AWS — Phase 6: SNS + SQS + EventBridge
# Wires the event-driven backbone:
#   - SNS TaskAssignmentTopic   → email + SQS
#   - SQS TaskAssignmentQueue   → AssignmentWorkerLambda
#   - SNS DailyDigestTopic      → email
#   - EventBridge DailyDigestRule (cron 9 AM UTC) → DailyDigestLambda
# Idempotent: safe to re-run.
# =============================================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -f aws-output.env ]; then
  echo "ERROR: aws-output.env not found. Run earlier phases first."
  exit 1
fi
set -a; source aws-output.env; set +a

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID}"
PROJECT="Syncora"
export AWS_DEFAULT_REGION="$REGION"
export AWS_PAGER=""

# Email subscriber for SNS notifications
SUBSCRIBE_EMAIL="youssefbadr888@gmail.com"

# Names
TASK_TOPIC_NAME="TaskAssignmentTopic"
DIGEST_TOPIC_NAME="DailyDigestTopic"
QUEUE_NAME="TaskAssignmentQueue"
EVENTBRIDGE_RULE="DailyDigestRule"

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

# Git Bash path → Windows path for AWS CLI (a native Windows binary).
winpath() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$1"
  else
    echo "$1"
  fi
}

topic_arn_by_name() {
  aws sns list-topics --query "Topics[?contains(TopicArn, \`:$1\`)].TopicArn | [0]" \
    --output text 2>/dev/null | sed 's/None//'
}

queue_url_by_name() {
  aws sqs get-queue-url --queue-name "$1" --query 'QueueUrl' --output text 2>/dev/null \
    || echo ""
}

subscription_exists() {
  local TOPIC=$1
  local ENDPOINT=$2
  aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" \
    --query "Subscriptions[?Endpoint=='$ENDPOINT'].SubscriptionArn | [0]" \
    --output text 2>/dev/null | grep -qv "^None$\|^PendingConfirmation$" && return 0
  # PendingConfirmation also counts as "exists" — don't resubscribe
  aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" \
    --query "Subscriptions[?Endpoint=='$ENDPOINT'].SubscriptionArn | [0]" \
    --output text 2>/dev/null | grep -q "PendingConfirmation"
}

# ─────────────────────────────────────────────────────────────────────────────
# SNS — Task Assignment Topic
# ─────────────────────────────────────────────────────────────────────────────
log "Creating SNS topic: $TASK_TOPIC_NAME"
TASK_TOPIC_ARN=$(topic_arn_by_name "$TASK_TOPIC_NAME")
if [ -z "$TASK_TOPIC_ARN" ]; then
  TASK_TOPIC_ARN=$(aws sns create-topic --name "$TASK_TOPIC_NAME" \
    --query 'TopicArn' --output text)
  ok "Created: $TASK_TOPIC_ARN"
else
  skip "Topic exists: $TASK_TOPIC_ARN"
fi

# ─────────────────────────────────────────────────────────────────────────────
# SQS — Task Assignment Queue
# ─────────────────────────────────────────────────────────────────────────────
log "Creating SQS queue: $QUEUE_NAME"
QUEUE_URL=$(queue_url_by_name "$QUEUE_NAME")
if [ -z "$QUEUE_URL" ]; then
  QUEUE_URL=$(aws sqs create-queue --queue-name "$QUEUE_NAME" \
    --attributes VisibilityTimeout=30,MessageRetentionPeriod=345600 \
    --query 'QueueUrl' --output text)
  ok "Created: $QUEUE_URL"
else
  skip "Queue exists: $QUEUE_URL"
fi

QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "$QUEUE_URL" \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)
echo "  Queue ARN: $QUEUE_ARN"

# ─────────────────────────────────────────────────────────────────────────────
# SQS Access Policy — allow SNS to send messages to SQS
# ─────────────────────────────────────────────────────────────────────────────
log "Setting SQS access policy (SNS → SQS)..."

# Build the policy JSON and the attributes wrapper as separate files,
# then pass the attributes file via file:// (which AWS CLI parses correctly).
POLICY_FILE="$HOME/sqs-policy.json"
ATTRS_FILE="$HOME/sqs-attrs.json"

cat > "$POLICY_FILE" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSNSPublish",
    "Effect": "Allow",
    "Principal": {"Service": "sns.amazonaws.com"},
    "Action": "sqs:SendMessage",
    "Resource": "${QUEUE_ARN}",
    "Condition": {
      "ArnEquals": {"aws:SourceArn": "${TASK_TOPIC_ARN}"}
    }
  }]
}
JSON

# AWS CLI expects --attributes as JSON {"AttrName": "string"} — and Policy
# itself must be a JSON string (escaped), so we serialise it.
POLICY_ONE_LINE=$(cat "$POLICY_FILE" | tr -d '\n' | sed 's/"/\\"/g')
cat > "$ATTRS_FILE" <<JSON
{"Policy": "${POLICY_ONE_LINE}"}
JSON

ATTRS_WIN=$(winpath "$ATTRS_FILE")
aws sqs set-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attributes "file://$ATTRS_WIN"
ok "SQS policy set"

# ─────────────────────────────────────────────────────────────────────────────
# SNS → SQS subscription
# ─────────────────────────────────────────────────────────────────────────────
log "Subscribing SQS to SNS TaskAssignmentTopic..."
EXISTING_SUB=$(aws sns list-subscriptions-by-topic --topic-arn "$TASK_TOPIC_ARN" \
  --query "Subscriptions[?Endpoint=='$QUEUE_ARN'].SubscriptionArn | [0]" \
  --output text 2>/dev/null | sed 's/None//')

if [ -n "$EXISTING_SUB" ]; then
  skip "SQS already subscribed: $EXISTING_SUB"
else
  SUB_ARN=$(aws sns subscribe \
    --topic-arn "$TASK_TOPIC_ARN" \
    --protocol sqs \
    --notification-endpoint "$QUEUE_ARN" \
    --attributes RawMessageDelivery=false \
    --query 'SubscriptionArn' --output text)
  ok "Subscribed: $SUB_ARN"
fi

# ─────────────────────────────────────────────────────────────────────────────
# SNS → Email subscription (task assignment notifications to assignee)
# ─────────────────────────────────────────────────────────────────────────────
log "Subscribing email to TaskAssignmentTopic: $SUBSCRIBE_EMAIL"
EXISTING_EMAIL_SUB=$(aws sns list-subscriptions-by-topic --topic-arn "$TASK_TOPIC_ARN" \
  --query "Subscriptions[?Endpoint=='$SUBSCRIBE_EMAIL'].SubscriptionArn | [0]" \
  --output text 2>/dev/null | sed 's/None//')

if [ -n "$EXISTING_EMAIL_SUB" ]; then
  skip "Email already subscribed (state: $EXISTING_EMAIL_SUB)"
else
  aws sns subscribe \
    --topic-arn "$TASK_TOPIC_ARN" \
    --protocol email \
    --notification-endpoint "$SUBSCRIBE_EMAIL" >/dev/null
  ok "Subscribed (CHECK YOUR INBOX to confirm)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Lambda event-source-mapping: SQS → AssignmentWorkerLambda
# ─────────────────────────────────────────────────────────────────────────────
log "Wiring SQS → AssignmentWorkerLambda..."
EXISTING_MAPPING=$(aws lambda list-event-source-mappings \
  --function-name AssignmentWorkerLambda \
  --query "EventSourceMappings[?EventSourceArn=='$QUEUE_ARN'].UUID | [0]" \
  --output text 2>/dev/null | sed 's/None//')

if [ -n "$EXISTING_MAPPING" ]; then
  skip "Event source mapping exists: $EXISTING_MAPPING"
else
  aws lambda create-event-source-mapping \
    --function-name AssignmentWorkerLambda \
    --event-source-arn "$QUEUE_ARN" \
    --batch-size 10 \
    --enabled >/dev/null
  ok "AssignmentWorkerLambda will drain $QUEUE_NAME"
fi

# ─────────────────────────────────────────────────────────────────────────────
# SNS — Daily Digest Topic
# ─────────────────────────────────────────────────────────────────────────────
log "Creating SNS topic: $DIGEST_TOPIC_NAME"
DIGEST_TOPIC_ARN=$(topic_arn_by_name "$DIGEST_TOPIC_NAME")
if [ -z "$DIGEST_TOPIC_ARN" ]; then
  DIGEST_TOPIC_ARN=$(aws sns create-topic --name "$DIGEST_TOPIC_NAME" \
    --query 'TopicArn' --output text)
  ok "Created: $DIGEST_TOPIC_ARN"
else
  skip "Topic exists: $DIGEST_TOPIC_ARN"
fi

log "Subscribing email to DailyDigestTopic..."
EXISTING_DIGEST_SUB=$(aws sns list-subscriptions-by-topic --topic-arn "$DIGEST_TOPIC_ARN" \
  --query "Subscriptions[?Endpoint=='$SUBSCRIBE_EMAIL'].SubscriptionArn | [0]" \
  --output text 2>/dev/null | sed 's/None//')

if [ -n "$EXISTING_DIGEST_SUB" ]; then
  skip "Email already subscribed to digest topic"
else
  aws sns subscribe \
    --topic-arn "$DIGEST_TOPIC_ARN" \
    --protocol email \
    --notification-endpoint "$SUBSCRIBE_EMAIL" >/dev/null
  ok "Subscribed (CHECK YOUR INBOX to confirm)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Update DailyDigestLambda env var with real topic ARN
# ─────────────────────────────────────────────────────────────────────────────
log "Updating DailyDigestLambda env with SNS_DIGEST_TOPIC_ARN..."
aws lambda update-function-configuration \
  --function-name DailyDigestLambda \
  --environment "Variables={
    DDB_TASKS_TABLE=Tasks,
    DDB_USERS_TABLE=Users,
    SNS_DIGEST_TOPIC_ARN=${DIGEST_TOPIC_ARN}
  }" >/dev/null
aws lambda wait function-updated --function-name DailyDigestLambda
ok "DailyDigestLambda env updated"

# ─────────────────────────────────────────────────────────────────────────────
# EventBridge rule — daily 9 AM UTC → DailyDigestLambda
# ─────────────────────────────────────────────────────────────────────────────
log "Creating EventBridge rule: $EVENTBRIDGE_RULE"
RULE_ARN=$(aws events describe-rule --name "$EVENTBRIDGE_RULE" \
  --query 'Arn' --output text 2>/dev/null | sed 's/None//' || echo "")

if [ -z "$RULE_ARN" ]; then
  RULE_ARN=$(aws events put-rule \
    --name "$EVENTBRIDGE_RULE" \
    --schedule-expression "cron(0 9 * * ? *)" \
    --state ENABLED \
    --description "Daily digest at 9:00 AM UTC — fires DailyDigestLambda" \
    --query 'RuleArn' --output text)
  ok "Rule created: $RULE_ARN"
else
  skip "Rule exists: $RULE_ARN"
fi

# Grant EventBridge permission to invoke the Lambda
log "Granting EventBridge → Lambda invoke permission..."
aws lambda remove-permission \
  --function-name DailyDigestLambda \
  --statement-id eventbridge-daily-digest 2>/dev/null || true

aws lambda add-permission \
  --function-name DailyDigestLambda \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "$RULE_ARN" \
  --statement-id eventbridge-daily-digest >/dev/null
ok "Invoke permission granted"

# Wire the rule target → Lambda
log "Setting rule target..."
DIGEST_LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:DailyDigestLambda"
aws events put-targets \
  --rule "$EVENTBRIDGE_RULE" \
  --targets "Id=1,Arn=${DIGEST_LAMBDA_ARN}" >/dev/null
ok "Target wired: DailyDigestLambda"

# ─────────────────────────────────────────────────────────────────────────────
# Update aws-output.env
# ─────────────────────────────────────────────────────────────────────────────
log "Updating aws-output.env..."

# Strip old Phase 6 values then re-append
grep -v "^SNS_TASK_ASSIGNMENT_TOPIC_ARN\|^SNS_DIGEST_TOPIC_ARN\|^SQS_ASSIGNMENT_QUEUE_URL\|^SQS_ASSIGNMENT_QUEUE_ARN" \
  aws-output.env > aws-output.env.tmp || true
mv aws-output.env.tmp aws-output.env

cat >> aws-output.env <<EOF

# ── Phase 6 ──────────────────────────────────────────────────────────────────
SNS_TASK_ASSIGNMENT_TOPIC_ARN=${TASK_TOPIC_ARN}
SNS_DIGEST_TOPIC_ARN=${DIGEST_TOPIC_ARN}
SQS_ASSIGNMENT_QUEUE_URL=${QUEUE_URL}
SQS_ASSIGNMENT_QUEUE_ARN=${QUEUE_ARN}
EOF
chmod 600 aws-output.env
ok "aws-output.env updated"

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Phase 6 Complete — Event-Driven Backbone"
echo "============================================================"
echo "  SNS Task Assignment Topic:"
echo "    $TASK_TOPIC_ARN"
echo "  SNS Daily Digest Topic:"
echo "    $DIGEST_TOPIC_ARN"
echo "  SQS Queue:"
echo "    $QUEUE_URL"
echo "  EventBridge Rule:"
echo "    $EVENTBRIDGE_RULE (cron 0 9 * * ? *) → DailyDigestLambda"
echo ""
echo "  Event-source mappings:"
aws lambda list-event-source-mappings \
  --function-name AssignmentWorkerLambda \
  --query 'EventSourceMappings[].[EventSourceArn,State]' --output table
echo ""
echo "  Email subscriber: $SUBSCRIBE_EMAIL"
echo "  ⚠️  TWO confirmation emails were sent. Click both links to activate."
echo "============================================================"
echo "  Next step: Phase 8 — CloudWatch dashboard + alarms"
echo "  (Phase 7 is the frontend — handled separately)"
echo "============================================================"
