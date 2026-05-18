#!/bin/bash
# =============================================================================
# Mini-Jira on AWS — Phase 8: CloudWatch Dashboard + Alarms
# Creates:
#   - Dashboard: MiniJira-Overview (tasks created/closed, TTC, EC2 CPU, assignments)
#   - Alarm: OverdueTasks >= threshold → SNS
#   - Existing Lambda/SQS ops alarms
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
CW_NAMESPACE="${CW_NAMESPACE:-MiniJira}"
ALARM_TOPIC_ARN="${SNS_TASK_ASSIGNMENT_TOPIC_ARN:-${SNS_DIGEST_TOPIC_ARN}}"
QUEUE_NAME="TaskAssignmentQueue"
ASG_NAME="${ASG_NAME:-Syncora-asg}"

log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD (spec widgets + ops metrics)
# ─────────────────────────────────────────────────────────────────────────────
log "Creating CloudWatch dashboard: $DASHBOARD_NAME"

DASHBOARD_BODY=$(cat <<JSON
{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Tasks Created Per Day",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["${CW_NAMESPACE}", "TasksCreated", {"stat": "Sum", "period": 86400}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Tasks Closed Per Day (by Team)",
        "view": "timeSeries",
        "stacked": true,
        "metrics": [
          ["${CW_NAMESPACE}", "TasksClosed", "TeamId", "team-frontend", {"stat": "Sum", "period": 86400}],
          ["${CW_NAMESPACE}", "TasksClosed", "TeamId", "team-backend", {"stat": "Sum", "period": 86400}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "Average Time To Close (seconds)",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["${CW_NAMESPACE}", "TimeToClose", {"stat": "Average", "period": 86400}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "EC2 CPU Utilization (ASG)",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", "${ASG_NAME}", {"stat": "Average", "period": 300}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 12, "width": 12, "height": 6,
      "properties": {
        "title": "Tasks Assigned Per Team",
        "view": "timeSeries",
        "stacked": true,
        "metrics": [
          ["${CW_NAMESPACE}", "TasksAssigned", "TeamId", "team-frontend", {"stat": "Sum", "period": 300}],
          ["${CW_NAMESPACE}", "TasksAssigned", "TeamId", "team-backend", {"stat": "Sum", "period": 300}]
        ],
        "region": "${REGION}"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 12, "width": 12, "height": 6,
      "properties": {
        "title": "Overdue Tasks (open, past deadline)",
        "view": "timeSeries",
        "stacked": false,
        "metrics": [
          ["${CW_NAMESPACE}", "OverdueTasks", {"stat": "Maximum", "period": 300}]
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
  EXISTING=$(aws cloudwatch describe-alarms --alarm-names "$NAME" \
    --query 'MetricAlarms[0].AlarmName' --output text 2>/dev/null | sed 's/None//')
  if [ -n "$EXISTING" ]; then
    skip "Alarm exists (updating): $NAME"
  fi
  aws cloudwatch put-metric-alarm --alarm-name "$NAME" "$@"
  ok "Alarm set: $NAME"
}

log "Creating alarm: OverdueTasks threshold"
create_or_update_alarm "OverdueTasksAlarm" \
  --alarm-description "Overdue open tasks exceed threshold" \
  --namespace "${CW_NAMESPACE}" \
  --metric-name "OverdueTasks" \
  --statistic "Maximum" \
  --period 3600 \
  --evaluation-periods 1 \
  --threshold 10 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --treat-missing-data "notBreaching" \
  --alarm-actions "$ALARM_TOPIC_ARN" \
  --ok-actions "$ALARM_TOPIC_ARN"

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

echo ""
echo "============================================================"
echo "  Phase 8 Complete — CloudWatch Dashboard + Alarms"
echo "============================================================"
echo "  Dashboard: $DASHBOARD_NAME"
echo "    https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=${DASHBOARD_NAME}"
echo ""
echo "  Alarm notifications → $ALARM_TOPIC_ARN"
echo "============================================================"
