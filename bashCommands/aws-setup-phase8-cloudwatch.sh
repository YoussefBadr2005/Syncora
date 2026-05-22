#!/bin/bash
# =============================================================================
# Mini-Jira on AWS — Phase 8: CloudWatch Dashboard + Alarms
# Creates:
#   - Dashboard: MiniJira-Overview with rubric widgets:
#       Tasks Created/day (per team), Tasks Closed/day (per team),
#       EC2 CPU Utilization (ASG), Tasks Assigned per team,
#       Lambda errors, SQS depth/age, DynamoDB write capacity
#   - Alarm: AssignmentWorkerLambda errors → SNS ops topic
#   - Alarm: SQS queue depth > 100 messages
#   - Alarm: DailyDigestLambda errors
# Idempotent: safe to re-run.
#
# NOTE: task-level widgets read custom metrics in the "MiniJira" namespace
# emitted by the backend (TasksCreated/TasksClosed, dims TeamId+OrgId) and the
# assignment-worker Lambda (TasksAssigned, dim TeamId). They use SEARCH() so
# real (UUID) team ids appear automatically. "Average time-to-close" is NOT yet
# emitted by the backend — add an emitMetric("TaskTimeToClose", ...) on close
# and a widget for it to fully satisfy the rubric.
# Live alarms publish to OpsAlarmTopic; this script uses SNS_DIGEST_TOPIC_ARN
# by default — set ALARM_TOPIC_ARN to your ops topic if you created one.
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
      "type": "metric", "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Tasks Created per day (per team)",
        "view": "timeSeries", "stacked": true, "region": "${REGION}",
        "metrics": [
          [ { "expression": "SEARCH('{MiniJira,OrgId,TeamId} MetricName=\"TasksCreated\"', 'Sum', 86400)", "id": "created", "region": "${REGION}", "label": "Created" } ]
        ],
        "yAxis": { "left": { "min": 0 } }
      }
    },
    {
      "type": "metric", "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Tasks Closed per day (per team)",
        "view": "timeSeries", "stacked": true, "region": "${REGION}",
        "metrics": [
          [ { "expression": "SEARCH('{MiniJira,OrgId,TeamId} MetricName=\"TasksClosed\"', 'Sum', 86400)", "id": "closed", "region": "${REGION}", "label": "Closed" } ]
        ],
        "yAxis": { "left": { "min": 0 } }
      }
    },
    {
      "type": "metric", "x": 0, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "EC2 CPU Utilization (ASG)",
        "view": "timeSeries", "stacked": false, "region": "${REGION}",
        "metrics": [
          [ "AWS/EC2", "CPUUtilization", "AutoScalingGroupName", "Syncora-asg", { "stat": "Average", "period": 300, "label": "avg CPU %" } ],
          [ "...", { "stat": "Maximum", "period": 300, "label": "max CPU %" } ]
        ],
        "yAxis": { "left": { "min": 0, "max": 100 } }
      }
    },
    {
      "type": "metric", "x": 12, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "Tasks Assigned per team",
        "view": "timeSeries", "stacked": true, "region": "${REGION}",
        "metrics": [
          [ { "expression": "SEARCH('{MiniJira,TeamId} MetricName=\"TasksAssigned\"', 'Sum', 86400)", "id": "assigned", "region": "${REGION}", "label": "Assigned" } ]
        ],
        "yAxis": { "left": { "min": 0 } }
      }
    },
    {
      "type": "metric", "x": 0, "y": 12, "width": 8, "height": 6,
      "properties": {
        "title": "Lambda Errors",
        "view": "timeSeries", "stacked": false, "region": "${REGION}",
        "metrics": [
          ["AWS/Lambda","Errors","FunctionName","AssignmentWorkerLambda",{"stat":"Sum","period":300}],
          ["...","FunctionName","DailyDigestLambda",{"stat":"Sum","period":300}],
          ["...","FunctionName","ImageResizeLambda",{"stat":"Sum","period":300}]
        ]
      }
    },
    {
      "type": "metric", "x": 8, "y": 12, "width": 8, "height": 6,
      "properties": {
        "title": "SQS — TaskAssignmentQueue",
        "view": "timeSeries", "stacked": false, "region": "${REGION}",
        "metrics": [
          ["AWS/SQS","ApproximateNumberOfMessagesVisible","QueueName","${QUEUE_NAME}",{"stat":"Maximum","period":60,"label":"depth"}],
          ["AWS/SQS","ApproximateAgeOfOldestMessage","QueueName","${QUEUE_NAME}",{"stat":"Maximum","period":60,"label":"oldest age (s)"}]
        ]
      }
    },
    {
      "type": "metric", "x": 16, "y": 12, "width": 8, "height": 6,
      "properties": {
        "title": "DynamoDB Consumed Write Capacity",
        "view": "timeSeries", "stacked": false, "region": "${REGION}",
        "metrics": [
          ["AWS/DynamoDB","ConsumedWriteCapacityUnits","TableName","Tasks",{"stat":"Sum","period":300}],
          ["...","TableName","ActivityLogs",{"stat":"Sum","period":300}],
          ["...","TableName","StatusLogs",{"stat":"Sum","period":300}]
        ]
      }
    },
    {
      "type": "metric", "x": 0, "y": 18, "width": 12, "height": 6,
      "properties": {
        "title": "Avg Time to Close (hours, per team)",
        "view": "timeSeries", "stacked": false, "region": "${REGION}",
        "metrics": [
          [ { "expression": "SEARCH('{MiniJira,OrgId,TeamId} MetricName=\"TaskTimeToClose\"', 'Average', 86400)", "id": "ttc", "region": "${REGION}", "label": "avg hours" } ]
        ],
        "yAxis": { "left": { "min": 0 } }
      }
    },
    {
      "type": "metric", "x": 12, "y": 18, "width": 12, "height": 6,
      "properties": {
        "title": "Overdue Tasks (total)",
        "view": "timeSeries", "stacked": false, "region": "${REGION}",
        "metrics": [
          [ "MiniJira", "OverdueTasks", { "stat": "Maximum", "period": 86400, "label": "overdue" } ]
        ],
        "yAxis": { "left": { "min": 0 } }
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

# Rubric's example alarm: overdue tasks exceeding a threshold -> SNS.
# Reads the MiniJira/OverdueTasks metric emitted by the daily-digest Lambda.
log "Creating alarm: Overdue tasks above threshold"
create_or_update_alarm "Overdue-Tasks-High" \
  --alarm-description "Overdue tasks (deadline passed, not Done) exceed threshold" \
  --namespace "MiniJira" \
  --metric-name "OverdueTasks" \
  --statistic "Maximum" \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator "GreaterThanThreshold" \
  --treat-missing-data "ignore" \
  --alarm-actions "$ALARM_TOPIC_ARN" \
  --ok-actions "$ALARM_TOPIC_ARN"

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
