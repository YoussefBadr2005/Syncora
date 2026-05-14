#!/bin/bash
# =============================================================================
# Mini-Jira on AWS — Phase 8: CloudWatch Dashboard + Alarms
# Creates:
#   - Dashboard: MiniJira-Overview (Lambda errors, SQS depth, DDB consumed)
#   - Alarm: AssignmentWorkerLambda errors → SNS digest topic
#   - Alarm: SQS queue depth > 100 messages
#   - Alarm: DailyDigestLambda errors
# Idempotent: safe to re-run.
# =============================================================================

set -euo pipefail

if [ ! -f aws-output.env ]; then
  echo "ERROR: aws-output.env not found. Run earlier phases first."
  exit 1
fi
set -a; source aws-output.env; set +a

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID}"
export AWS_DEFAULT_REGION="$REGION"
export AWS_PAGER=""

DASHBOARD_NAME="MiniJira-Overview"
ALARM_TOPIC_ARN="${SNS_DIGEST_TOPIC_ARN}"   # reuse digest topic for ops alerts
QUEUE_NAME="TaskAssignmentQueue"

log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────
log "Creating CloudWatch dashboard: $DASHBOARD_NAME"

DASHBOARD_BODY=$(cat <<JSON
{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Lambda Errors",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["AWS/Lambda","Errors","FunctionName","AssignmentWorkerLambda",{"stat":"Sum","period":300}],
          ["AWS/Lambda","Errors","FunctionName","DailyDigestLambda",{"stat":"Sum","period":300}],
          ["AWS/Lambda","Errors","FunctionName","ImageResizeLambda",{"stat":"Sum","period":300}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Lambda Invocations",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["AWS/Lambda","Invocations","FunctionName","AssignmentWorkerLambda",{"stat":"Sum","period":300}],
          ["AWS/Lambda","Invocations","FunctionName","DailyDigestLambda",{"stat":"Sum","period":300}],
          ["AWS/Lambda","Invocations","FunctionName","ImageResizeLambda",{"stat":"Sum","period":300}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "SQS — TaskAssignmentQueue Depth",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["AWS/SQS","ApproximateNumberOfMessagesVisible","QueueName","${QUEUE_NAME}",{"stat":"Maximum","period":60}],
          ["AWS/SQS","ApproximateAgeOfOldestMessage","QueueName","${QUEUE_NAME}",{"stat":"Maximum","period":60}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "Custom — Tasks Assigned per Team",
        "view": "timeSeries",
        "stacked": true,
        "metrics": [
          ["MiniJira","TasksAssigned","TeamId","team-frontend",{"stat":"Sum","period":300}],
          ["MiniJira","TasksAssigned","TeamId","team-backend",{"stat":"Sum","period":300}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 12, "width": 12, "height": 6,
      "properties": {
        "title": "Lambda Duration (ms)",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["AWS/Lambda","Duration","FunctionName","AssignmentWorkerLambda",{"stat":"p99","period":300}],
          ["AWS/Lambda","Duration","FunctionName","DailyDigestLambda",{"stat":"p99","period":300}],
          ["AWS/Lambda","Duration","FunctionName","ImageResizeLambda",{"stat":"p99","period":300}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 12, "width": 12, "height": 6,
      "properties": {
        "title": "DynamoDB Consumed Write Capacity",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["AWS/DynamoDB","ConsumedWriteCapacityUnits","TableName","Tasks",{"stat":"Sum","period":300}],
          ["AWS/DynamoDB","ConsumedWriteCapacityUnits","TableName","ActivityLogs",{"stat":"Sum","period":300}],
          ["AWS/DynamoDB","ConsumedWriteCapacityUnits","TableName","StatusLogs",{"stat":"Sum","period":300}]
        ],
        "region": "${REGION}"
      }
    }
  ]
}
JSON
)

aws cloudwatch put-dashboard \
  --dashboard-name "$DASHBOARD_NAME" \
  --dashboard-body "$DASHBOARD_BODY" >/dev/null
ok "Dashboard created: $DASHBOARD_NAME"

# ─────────────────────────────────────────────────────────────────────────────
# ALARMS
# ─────────────────────────────────────────────────────────────────────────────

create_or_update_alarm() {
  local NAME=$1
  shift
  # Check if alarm exists
  EXISTING=$(aws cloudwatch describe-alarms --alarm-names "$NAME" \
    --query 'MetricAlarms[0].AlarmName' --output text 2>/dev/null | sed 's/None//')
  if [ -n "$EXISTING" ]; then
    skip "Alarm exists (updating): $NAME"
  fi
  aws cloudwatch put-metric-alarm --alarm-name "$NAME" "$@"
  ok "Alarm set: $NAME"
}

log "Creating alarm: AssignmentWorkerLambda errors"
create_or_update_alarm "AssignmentWorker-Errors" \
  --alarm-description "AssignmentWorkerLambda has errors" \
  --namespace "AWS/Lambda" \
  --metric-name "Errors" \
  --dimensions "Name=FunctionName,Value=AssignmentWorkerLambda" \
  --statistic "Sum" \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --treat-missing-data "notBreaching" \
  --alarm-actions "$ALARM_TOPIC_ARN" \
  --ok-actions "$ALARM_TOPIC_ARN"

log "Creating alarm: DailyDigestLambda errors"
create_or_update_alarm "DailyDigest-Errors" \
  --alarm-description "DailyDigestLambda has errors" \
  --namespace "AWS/Lambda" \
  --metric-name "Errors" \
  --dimensions "Name=FunctionName,Value=DailyDigestLambda" \
  --statistic "Sum" \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --treat-missing-data "notBreaching" \
  --alarm-actions "$ALARM_TOPIC_ARN" \
  --ok-actions "$ALARM_TOPIC_ARN"

log "Creating alarm: ImageResizeLambda errors"
create_or_update_alarm "ImageResize-Errors" \
  --alarm-description "ImageResizeLambda has errors" \
  --namespace "AWS/Lambda" \
  --metric-name "Errors" \
  --dimensions "Name=FunctionName,Value=ImageResizeLambda" \
  --statistic "Sum" \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --treat-missing-data "notBreaching" \
  --alarm-actions "$ALARM_TOPIC_ARN" \
  --ok-actions "$ALARM_TOPIC_ARN"

log "Creating alarm: SQS queue depth"
create_or_update_alarm "TaskAssignmentQueue-Depth" \
  --alarm-description "SQS TaskAssignmentQueue has more than 100 messages waiting" \
  --namespace "AWS/SQS" \
  --metric-name "ApproximateNumberOfMessagesVisible" \
  --dimensions "Name=QueueName,Value=${QUEUE_NAME}" \
  --statistic "Maximum" \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 100 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --treat-missing-data "notBreaching" \
  --alarm-actions "$ALARM_TOPIC_ARN"

log "Creating alarm: SQS message age (processing lag)"
create_or_update_alarm "TaskAssignmentQueue-MessageAge" \
  --alarm-description "SQS messages waiting more than 5 minutes — Lambda may be failing" \
  --namespace "AWS/SQS" \
  --metric-name "ApproximateAgeOfOldestMessage" \
  --dimensions "Name=QueueName,Value=${QUEUE_NAME}" \
  --statistic "Maximum" \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 300 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --treat-missing-data "notBreaching" \
  --alarm-actions "$ALARM_TOPIC_ARN"

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Phase 8 Complete — CloudWatch Dashboard + Alarms"
echo "============================================================"
echo "  Dashboard: $DASHBOARD_NAME"
echo "    https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=${DASHBOARD_NAME}"
echo ""
echo "  Alarms:"
aws cloudwatch describe-alarms \
  --alarm-names \
    "AssignmentWorker-Errors" \
    "DailyDigest-Errors" \
    "ImageResize-Errors" \
    "TaskAssignmentQueue-Depth" \
    "TaskAssignmentQueue-MessageAge" \
  --query 'MetricAlarms[].[AlarmName,StateValue]' \
  --output table
echo ""
echo "  Alarm notifications → $ALARM_TOPIC_ARN"
echo "============================================================"
echo "  Next step: Phase 9 — ALB + Auto Scaling Group + CloudFront"
echo "============================================================"
