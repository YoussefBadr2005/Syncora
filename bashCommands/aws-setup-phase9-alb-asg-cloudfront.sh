#!/bin/bash
# =============================================================================
# Mini-Jira on AWS — Phase 9: ALB + Launch Template + Auto Scaling Group + CloudFront
# Creates:
#   - Application Load Balancer (public, across 2 AZs)
#   - ALB Target Group (HTTP 3000, health check /api/health)
#   - ALB Listener (HTTP:80)
#   - EC2 Launch Template (Node 20, pulls repo, runs backend via PM2)
#   - Auto Scaling Group (min 1, max 3, desired 1) in private subnets
#   - CloudFront distribution pointing to ALB origin
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
PROJECT="Syncora"
export AWS_DEFAULT_REGION="$REGION"
export AWS_PAGER=""

# Resource names
ALB_NAME="${PROJECT}-alb"
TG_NAME="${PROJECT}-tg"
LT_NAME="${PROJECT}-launch-template"
ASG_NAME="${PROJECT}-asg"
CF_COMMENT="${PROJECT}-backend-distribution"

# IDs from Phase 1-2
VPC_ID="${VPC_ID}"
PUBLIC_SUBNET_A="${PUBLIC_SUBNET_A}"
PUBLIC_SUBNET_B="${PUBLIC_SUBNET_B}"
PRIVATE_SUBNET_A="${PRIVATE_SUBNET_A}"
PRIVATE_SUBNET_B="${PRIVATE_SUBNET_B}"
SG_ALB="${SG_ALB}"
SG_EC2="${SG_EC2}"

# EC2 settings
AMI_ID="ami-0c02fb55956c7d316"   # Amazon Linux 2 us-east-1 (free tier eligible)
INSTANCE_TYPE="t2.micro"
EC2_ROLE_NAME="${PROJECT}-role-ec2-backend"
KEY_NAME=""   # Leave empty for no SSH key (use SSM Session Manager instead)

log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

find_alb_by_name() {
  aws elbv2 describe-load-balancers \
    --query "LoadBalancers[?LoadBalancerName=='$1'].LoadBalancerArn | [0]" \
    --output text 2>/dev/null | sed 's/None//'
}

find_tg_by_name() {
  aws elbv2 describe-target-groups \
    --query "TargetGroups[?TargetGroupName=='$1'].TargetGroupArn | [0]" \
    --output text 2>/dev/null | sed 's/None//'
}

find_lt_by_name() {
  aws ec2 describe-launch-templates \
    --filters "Name=launch-template-name,Values=$1" \
    --query 'LaunchTemplates[0].LaunchTemplateId' \
    --output text 2>/dev/null | sed 's/None//'
}

find_asg_by_name() {
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$1" \
    --query 'AutoScalingGroups[0].AutoScalingGroupName' \
    --output text 2>/dev/null | sed 's/None//'
}

# ─────────────────────────────────────────────────────────────────────────────
# INSTANCE PROFILE for EC2
# ─────────────────────────────────────────────────────────────────────────────
log "Checking EC2 instance profile..."
PROFILE_NAME="${EC2_ROLE_NAME}-profile"
EXISTING_PROFILE=$(aws iam get-instance-profile \
  --instance-profile-name "$PROFILE_NAME" \
  --query 'InstanceProfile.InstanceProfileName' \
  --output text 2>/dev/null | sed 's/None//' || echo "")

if [ -z "$EXISTING_PROFILE" ]; then
  aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null
  aws iam add-role-to-instance-profile \
    --instance-profile-name "$PROFILE_NAME" \
    --role-name "$EC2_ROLE_NAME"
  ok "Instance profile created: $PROFILE_NAME"
else
  skip "Instance profile exists: $PROFILE_NAME"
fi

# ─────────────────────────────────────────────────────────────────────────────
# ALB TARGET GROUP
# ─────────────────────────────────────────────────────────────────────────────
log "Creating ALB target group: $TG_NAME"
TG_ARN=$(find_tg_by_name "$TG_NAME")
if [ -z "$TG_ARN" ]; then
  TG_ARN=$(aws elbv2 create-target-group \
    --name "$TG_NAME" \
    --protocol HTTP \
    --port 3000 \
    --vpc-id "$VPC_ID" \
    --target-type instance \
    --health-check-protocol HTTP \
    --health-check-path "/api/health" \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)
  ok "Target group created: $TG_ARN"
else
  skip "Target group exists: $TG_ARN"
fi

# ─────────────────────────────────────────────────────────────────────────────
# APPLICATION LOAD BALANCER
# ─────────────────────────────────────────────────────────────────────────────
log "Creating ALB: $ALB_NAME"
ALB_ARN=$(find_alb_by_name "$ALB_NAME")
if [ -z "$ALB_ARN" ]; then
  ALB_ARN=$(aws elbv2 create-load-balancer \
    --name "$ALB_NAME" \
    --subnets "$PUBLIC_SUBNET_A" "$PUBLIC_SUBNET_B" \
    --security-groups "$SG_ALB" \
    --scheme internet-facing \
    --type application \
    --ip-address-type ipv4 \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text)
  ok "ALB created: $ALB_ARN"
else
  skip "ALB exists: $ALB_ARN"
fi

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' \
  --output text)
echo "  ALB DNS: $ALB_DNS"

# ─────────────────────────────────────────────────────────────────────────────
# ALB LISTENER
# ─────────────────────────────────────────────────────────────────────────────
log "Creating ALB listener (HTTP:80)..."
EXISTING_LISTENER=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --query "Listeners[?Port==\`80\`].ListenerArn | [0]" \
  --output text 2>/dev/null | sed 's/None//')

if [ -z "$EXISTING_LISTENER" ]; then
  aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP \
    --port 80 \
    --default-actions "Type=forward,TargetGroupArn=$TG_ARN" >/dev/null
  ok "Listener created (HTTP:80 → $TG_NAME)"
else
  skip "Listener exists: $EXISTING_LISTENER"
fi

# ─────────────────────────────────────────────────────────────────────────────
# USER DATA SCRIPT
# ─────────────────────────────────────────────────────────────────────────────
# Build backend .env content from aws-output.env values
BACKEND_ENV="NODE_ENV=production
PORT=3000
AWS_REGION=${REGION}
COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
DDB_TASKS_TABLE=Tasks
DDB_PROJECTS_TABLE=Projects
DDB_USERS_TABLE=Users
DDB_COMMENTS_TABLE=Comments
DDB_ACTIVITY_LOGS_TABLE=ActivityLogs
DDB_STATUS_LOGS_TABLE=StatusLogs
DDB_TEAMS_TABLE=Teams
S3_ORIGINALS_BUCKET=${S3_ORIGINALS_BUCKET}
S3_RESIZED_BUCKET=${S3_RESIZED_BUCKET}
SNS_TASK_ASSIGNMENT_TOPIC=${SNS_TASK_ASSIGNMENT_TOPIC_ARN}
CLOUDFRONT_URL=__CLOUDFRONT_PLACEHOLDER__"

USER_DATA=$(cat <<'USERDATA_EOF'
#!/bin/bash
set -euo pipefail
exec > /var/log/user-data.log 2>&1

# ── System setup ──────────────────────────────────────────────────────────────
yum update -y
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git

# ── PM2 ───────────────────────────────────────────────────────────────────────
npm install -g pm2

# ── Clone repo ────────────────────────────────────────────────────────────────
mkdir -p /opt/app
cd /opt/app
git clone https://github.com/YoussefBadr2005/Syncora.git . || true

# ── Write .env ────────────────────────────────────────────────────────────────
cat > /opt/app/backend/.env << 'ENVEOF'
__BACKEND_ENV_PLACEHOLDER__
ENVEOF

# ── Install & build ───────────────────────────────────────────────────────────
cd /opt/app/backend
npm install --production=false
npm run build

# ── Start with PM2 ────────────────────────────────────────────────────────────
pm2 start dist/index.js --name mini-jira-backend
pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

echo "Bootstrap complete"
USERDATA_EOF
)

# Replace placeholders with real values
USER_DATA="${USER_DATA//__BACKEND_ENV_PLACEHOLDER__/$BACKEND_ENV}"

USER_DATA_B64=$(echo "$USER_DATA" | base64 -w 0)

# ─────────────────────────────────────────────────────────────────────────────
# LAUNCH TEMPLATE
# ─────────────────────────────────────────────────────────────────────────────
log "Creating launch template: $LT_NAME"
LT_ID=$(find_lt_by_name "$LT_NAME")

# Build key name config
if [ -n "$KEY_NAME" ]; then
  KEY_CONFIG="\"KeyName\": \"$KEY_NAME\","
else
  KEY_CONFIG=""
fi

LT_DATA=$(cat <<JSON
{
  "ImageId": "${AMI_ID}",
  "InstanceType": "${INSTANCE_TYPE}",
  ${KEY_CONFIG}
  "SecurityGroupIds": ["${SG_EC2}"],
  "IamInstanceProfile": {
    "Name": "${PROFILE_NAME}"
  },
  "UserData": "${USER_DATA_B64}",
  "TagSpecifications": [{
    "ResourceType": "instance",
    "Tags": [
      {"Key": "Name", "Value": "${PROJECT}-backend"},
      {"Key": "Project", "Value": "${PROJECT}"}
    ]
  }],
  "MetadataOptions": {
    "HttpTokens": "required",
    "HttpEndpoint": "enabled"
  }
}
JSON
)

if [ -z "$LT_ID" ]; then
  LT_ID=$(aws ec2 create-launch-template \
    --launch-template-name "$LT_NAME" \
    --version-description "v1" \
    --launch-template-data "$LT_DATA" \
    --query 'LaunchTemplate.LaunchTemplateId' \
    --output text)
  ok "Launch template created: $LT_ID"
else
  # Create a new version of the existing template
  aws ec2 create-launch-template-version \
    --launch-template-id "$LT_ID" \
    --version-description "updated" \
    --launch-template-data "$LT_DATA" >/dev/null
  # Set as default
  LATEST_VERSION=$(aws ec2 describe-launch-template-versions \
    --launch-template-id "$LT_ID" \
    --query 'LaunchTemplateVersions[-1].VersionNumber' \
    --output text)
  aws ec2 modify-launch-template \
    --launch-template-id "$LT_ID" \
    --default-version "$LATEST_VERSION" >/dev/null
  skip "Launch template updated to version $LATEST_VERSION: $LT_ID"
fi

# ─────────────────────────────────────────────────────────────────────────────
# AUTO SCALING GROUP
# ─────────────────────────────────────────────────────────────────────────────
log "Creating Auto Scaling Group: $ASG_NAME"
EXISTING_ASG=$(find_asg_by_name "$ASG_NAME")
if [ -z "$EXISTING_ASG" ]; then
  aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateId=${LT_ID},Version=\$Default" \
    --min-size 1 \
    --max-size 3 \
    --desired-capacity 1 \
    --vpc-zone-identifier "${PRIVATE_SUBNET_A},${PRIVATE_SUBNET_B}" \
    --target-group-arns "$TG_ARN" \
    --health-check-type ELB \
    --health-check-grace-period 120 \
    --tags \
      "Key=Name,Value=${PROJECT}-backend,PropagateAtLaunch=true" \
      "Key=Project,Value=${PROJECT},PropagateAtLaunch=true"
  ok "ASG created: $ASG_NAME"
else
  # Update existing ASG to use latest launch template
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateId=${LT_ID},Version=\$Default"
  skip "ASG updated: $ASG_NAME"
fi

# ── Target tracking scaling policy (CPU) ──────────────────────────────────────
log "Setting CPU target-tracking scaling policy..."
POLICY_EXISTS=$(aws autoscaling describe-policies \
  --auto-scaling-group-name "$ASG_NAME" \
  --policy-names "${ASG_NAME}-cpu-scaling" \
  --query 'ScalingPolicies[0].PolicyName' \
  --output text 2>/dev/null | sed 's/None//')

if [ -z "$POLICY_EXISTS" ]; then
  aws autoscaling put-scaling-policy \
    --auto-scaling-group-name "$ASG_NAME" \
    --policy-name "${ASG_NAME}-cpu-scaling" \
    --policy-type TargetTrackingScaling \
    --target-tracking-configuration '{
      "PredefinedMetricSpecification": {
        "PredefinedMetricType": "ASGAverageCPUUtilization"
      },
      "TargetValue": 60.0,
      "DisableScaleIn": false
    }' >/dev/null
  ok "CPU scaling policy set (target 60%)"
else
  skip "Scaling policy exists"
fi

# ─────────────────────────────────────────────────────────────────────────────
# CLOUDFRONT DISTRIBUTION
# ─────────────────────────────────────────────────────────────────────────────
log "Checking for existing CloudFront distribution..."
EXISTING_CF_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='${CF_COMMENT}'].Id | [0]" \
  --output text 2>/dev/null | sed 's/None//')

if [ -z "$EXISTING_CF_ID" ]; then
  log "Creating CloudFront distribution → ALB origin..."
  CF_CONFIG=$(cat <<JSON
{
  "Comment": "${CF_COMMENT}",
  "DefaultCacheBehavior": {
    "TargetOriginId": "alb-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET","HEAD"]}
    },
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId": "216adef6-5eac-4d55-b048-2c49ba114de3",
    "Compress": true
  },
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "alb-origin",
      "DomainName": "${ALB_DNS}",
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "http-only",
        "OriginReadTimeout": 60,
        "OriginKeepaliveTimeout": 5
      }
    }]
  },
  "Enabled": true,
  "HttpVersion": "http2",
  "IsIPV6Enabled": true,
  "PriceClass": "PriceClass_100"
}
JSON
)

  CF_RESULT=$(aws cloudfront create-distribution \
    --distribution-config "$CF_CONFIG" \
    --query 'Distribution.[Id,DomainName]' \
    --output text)

  CF_ID=$(echo "$CF_RESULT" | awk '{print $1}')
  CF_DOMAIN=$(echo "$CF_RESULT" | awk '{print $2}')
  ok "CloudFront distribution created: $CF_ID"
  echo "  Domain: https://$CF_DOMAIN"
  echo "  (Distribution takes ~10 min to deploy globally)"
else
  CF_ID="$EXISTING_CF_ID"
  CF_DOMAIN=$(aws cloudfront get-distribution \
    --id "$CF_ID" \
    --query 'Distribution.DomainName' \
    --output text)
  skip "CloudFront exists: $CF_ID → $CF_DOMAIN"
fi

# ─────────────────────────────────────────────────────────────────────────────
# UPDATE aws-output.env
# ─────────────────────────────────────────────────────────────────────────────
log "Updating aws-output.env..."
grep -v "^ALB_DNS_NAME\|^ALB_ARN\|^TG_ARN\|^ASG_NAME\|^LT_ID\|^CLOUDFRONT_DISTRIBUTION_URL\|^CLOUDFRONT_ID" \
  aws-output.env > aws-output.env.tmp || true
mv aws-output.env.tmp aws-output.env

cat >> aws-output.env <<EOF

# ── Phase 9 ──────────────────────────────────────────────────────────────────
ALB_DNS_NAME=${ALB_DNS}
ALB_ARN=${ALB_ARN}
TG_ARN=${TG_ARN}
ASG_NAME=${ASG_NAME}
LT_ID=${LT_ID}
CLOUDFRONT_DISTRIBUTION_URL=https://${CF_DOMAIN}
CLOUDFRONT_ID=${CF_ID}
EOF
chmod 600 aws-output.env
ok "aws-output.env updated"

# ─────────────────────────────────────────────────────────────────────────────
# UPDATE LAUNCH TEMPLATE with real CloudFront URL
# ─────────────────────────────────────────────────────────────────────────────
log "Updating launch template with real CloudFront URL..."
BACKEND_ENV_FINAL="${BACKEND_ENV//__CLOUDFRONT_PLACEHOLDER__/https:\/\/$CF_DOMAIN}"
USER_DATA_FINAL="${USER_DATA//__BACKEND_ENV_PLACEHOLDER__/$BACKEND_ENV_FINAL}"
USER_DATA_FINAL_B64=$(echo "$USER_DATA_FINAL" | base64 -w 0)

LT_DATA_FINAL=$(cat <<JSON
{
  "ImageId": "${AMI_ID}",
  "InstanceType": "${INSTANCE_TYPE}",
  ${KEY_CONFIG}
  "SecurityGroupIds": ["${SG_EC2}"],
  "IamInstanceProfile": {
    "Name": "${PROFILE_NAME}"
  },
  "UserData": "${USER_DATA_FINAL_B64}",
  "TagSpecifications": [{
    "ResourceType": "instance",
    "Tags": [
      {"Key": "Name", "Value": "${PROJECT}-backend"},
      {"Key": "Project", "Value": "${PROJECT}"}
    ]
  }],
  "MetadataOptions": {
    "HttpTokens": "required",
    "HttpEndpoint": "enabled"
  }
}
JSON
)

FINAL_VERSION=$(aws ec2 create-launch-template-version \
  --launch-template-id "$LT_ID" \
  --version-description "with-cloudfront-url" \
  --launch-template-data "$LT_DATA_FINAL" \
  --query 'LaunchTemplateVersion.VersionNumber' \
  --output text)

aws ec2 modify-launch-template \
  --launch-template-id "$LT_ID" \
  --default-version "$FINAL_VERSION" >/dev/null

# Trigger instance refresh so running instances get the new user data
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name "$ASG_NAME" \
  --preferences '{"MinHealthyPercentage": 0, "InstanceWarmup": 120}' >/dev/null 2>&1 || true

ok "Launch template updated with CloudFront URL (version $FINAL_VERSION)"

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Phase 9 Complete — ALB + ASG + CloudFront"
echo "============================================================"
echo "  ALB:          http://$ALB_DNS"
echo "  CloudFront:   https://$CF_DOMAIN"
echo "  ASG:          $ASG_NAME (min 1 / max 3 / desired 1)"
echo "  Launch Tmpl:  $LT_ID"
echo ""
echo "  ASG instance status:"
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query 'AutoScalingGroups[0].Instances[].[InstanceId,HealthStatus,LifecycleState]' \
  --output table
echo ""
echo "  ⚠️  IMPORTANT: Before instances will start correctly, push your"
echo "     backend code to GitHub and update the git clone URL in the"
echo "     launch template (currently a placeholder)."
echo ""
echo "  To check backend health once instance is running:"
echo "    curl http://$ALB_DNS/api/health"
echo ""
echo "  CloudFront is deploying (~10 min). Check status:"
echo "    aws cloudfront get-distribution --id $CF_ID --query 'Distribution.Status'"
echo "============================================================"
echo "  Next step: Phase 7 — Next.js frontend"
echo "============================================================"
