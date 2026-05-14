#!/bin/bash
# =============================================================================
# Mini-Jira on AWS — Phase 1 & 2 Setup Script
# Run this script once from your terminal with AWS CLI configured.
# Prerequisites: aws cli v2 installed, `aws configure` done with your credentials.
# Usage: chmod +x aws-setup-phase1-2.sh && ./aws-setup-phase1-2.sh
#
# Idempotent: safe to re-run. Resources are looked up by Name tag / role name
# and skipped if they already exist.
# =============================================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION — edit these before running
# ─────────────────────────────────────────────────────────────────────────────
REGION="us-east-1"
AZ_A="us-east-1a"
AZ_B="us-east-1b"
PROJECT="Syncora"

# Toggle this to "true" if you actually need NAT-level HA (will cost ~$65/mo
# for two NAT GWs). Default "false" runs a single NAT in AZ-A, shared by both
# private subnets — EC2s still run in both AZs, only egress fails-over is lost.
DUAL_NAT="false"

MANAGER_EMAIL="ali@demo.com"
MANAGER_PASSWORD="Manager123!"

EMPLOYEE_SARA_EMAIL="sara@demo.com"
EMPLOYEE_SARA_PASSWORD="Employee123!"

EMPLOYEE_OMAR_EMAIL="omar@demo.com"
EMPLOYEE_OMAR_PASSWORD="Employee123!"

# Propagate region to every subsequent aws call (fixes silent wrong-region bugs)
export AWS_DEFAULT_REGION="$REGION"
export AWS_PAGER=""

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

# Look up a resource by Name tag. Echoes ID or empty string.
find_by_name_tag() {
  local RESOURCE=$1  # vpc | subnet | internet-gateway | route-table | nat-gateway | security-group
  local NAME=$2
  case "$RESOURCE" in
    vpc)
      aws ec2 describe-vpcs --filters "Name=tag:Name,Values=$NAME" \
        --query 'Vpcs[0].VpcId' --output text 2>/dev/null | sed 's/None//'
      ;;
    subnet)
      aws ec2 describe-subnets --filters "Name=tag:Name,Values=$NAME" \
        --query 'Subnets[0].SubnetId' --output text 2>/dev/null | sed 's/None//'
      ;;
    internet-gateway)
      aws ec2 describe-internet-gateways --filters "Name=tag:Name,Values=$NAME" \
        --query 'InternetGateways[0].InternetGatewayId' --output text 2>/dev/null | sed 's/None//'
      ;;
    route-table)
      aws ec2 describe-route-tables --filters "Name=tag:Name,Values=$NAME" \
        --query 'RouteTables[0].RouteTableId' --output text 2>/dev/null | sed 's/None//'
      ;;
    nat-gateway)
      aws ec2 describe-nat-gateways \
        --filter "Name=tag:Name,Values=$NAME" "Name=state,Values=available,pending" \
        --query 'NatGateways[0].NatGatewayId' --output text 2>/dev/null | sed 's/None//'
      ;;
    security-group)
      aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME" \
        --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null | sed 's/None//'
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — VPC & NETWORKING
# ─────────────────────────────────────────────────────────────────────────────

log "Creating VPC..."
VPC_ID=$(find_by_name_tag vpc "${PROJECT}-VPC")
if [ -z "$VPC_ID" ]; then
  VPC_ID=$(aws ec2 create-vpc \
    --cidr-block 10.0.0.0/16 \
    --query 'Vpc.VpcId' --output text)
  aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames
  aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support
  aws ec2 create-tags --resources "$VPC_ID" --tags Key=Name,Value=${PROJECT}-VPC
  ok "VPC: $VPC_ID"
else
  skip "VPC already exists: $VPC_ID"
fi

# ── Internet Gateway ──────────────────────────────────────────────────────────
log "Creating Internet Gateway..."
IGW_ID=$(find_by_name_tag internet-gateway "${PROJECT}-IGW")
if [ -z "$IGW_ID" ]; then
  IGW_ID=$(aws ec2 create-internet-gateway \
    --query 'InternetGateway.InternetGatewayId' --output text)
  aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
  aws ec2 create-tags --resources "$IGW_ID" --tags Key=Name,Value=${PROJECT}-IGW
  ok "IGW: $IGW_ID"
else
  skip "IGW already exists: $IGW_ID"
fi

# ── Subnets ───────────────────────────────────────────────────────────────────
log "Creating subnets..."

create_subnet() {
  local NAME=$1
  local CIDR=$2
  local AZ=$3
  local EXISTING
  EXISTING=$(find_by_name_tag subnet "$NAME")
  if [ -n "$EXISTING" ]; then
    skip "Subnet $NAME already exists: $EXISTING"
    echo "$EXISTING"
    return
  fi
  local ID
  ID=$(aws ec2 create-subnet \
    --vpc-id "$VPC_ID" --cidr-block "$CIDR" \
    --availability-zone "$AZ" \
    --query 'Subnet.SubnetId' --output text)
  aws ec2 create-tags --resources "$ID" --tags Key=Name,Value="$NAME"
  ok "Subnet $NAME: $ID"
  echo "$ID"
}

PUB_A=$(create_subnet "${PROJECT}-Public-A"  10.0.1.0/24 "$AZ_A" | tail -n1)
PUB_B=$(create_subnet "${PROJECT}-Public-B"  10.0.2.0/24 "$AZ_B" | tail -n1)
PRIV_A=$(create_subnet "${PROJECT}-Private-A" 10.0.3.0/24 "$AZ_A" | tail -n1)
PRIV_B=$(create_subnet "${PROJECT}-Private-B" 10.0.4.0/24 "$AZ_B" | tail -n1)

aws ec2 modify-subnet-attribute --subnet-id "$PUB_A" --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id "$PUB_B" --map-public-ip-on-launch

# ── Elastic IPs & NAT Gateways ────────────────────────────────────────────────
log "Allocating NAT Gateway(s)..."

NAT_A=$(find_by_name_tag nat-gateway "${PROJECT}-NAT-A")
if [ -z "$NAT_A" ]; then
  EIP_A=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
  NAT_A=$(aws ec2 create-nat-gateway \
    --subnet-id "$PUB_A" \
    --allocation-id "$EIP_A" \
    --query 'NatGateway.NatGatewayId' --output text)
  aws ec2 create-tags --resources "$NAT_A" --tags Key=Name,Value=${PROJECT}-NAT-A
  echo "Waiting for NAT Gateway A..."
  aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_A"
  ok "NAT-A: $NAT_A"
else
  skip "NAT-A exists: $NAT_A"
fi

NAT_B=""
if [ "$DUAL_NAT" = "true" ]; then
  NAT_B=$(find_by_name_tag nat-gateway "${PROJECT}-NAT-B")
  if [ -z "$NAT_B" ]; then
    EIP_B=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
    NAT_B=$(aws ec2 create-nat-gateway \
      --subnet-id "$PUB_B" \
      --allocation-id "$EIP_B" \
      --query 'NatGateway.NatGatewayId' --output text)
    aws ec2 create-tags --resources "$NAT_B" --tags Key=Name,Value=${PROJECT}-NAT-B
    echo "Waiting for NAT Gateway B..."
    aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_B"
    ok "NAT-B: $NAT_B"
  else
    skip "NAT-B exists: $NAT_B"
  fi
else
  skip "DUAL_NAT=false: using single NAT-A for both private subnets (saves ~\$32/mo)"
fi

# ── Route Tables ──────────────────────────────────────────────────────────────
log "Creating route tables..."

# Public RT → IGW
PUB_RT=$(find_by_name_tag route-table "${PROJECT}-RT-Public")
if [ -z "$PUB_RT" ]; then
  PUB_RT=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
    --query 'RouteTable.RouteTableId' --output text)
  aws ec2 create-tags --resources "$PUB_RT" --tags Key=Name,Value=${PROJECT}-RT-Public
  aws ec2 create-route --route-table-id "$PUB_RT" \
    --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID" >/dev/null
  ok "Public RT: $PUB_RT"
else
  skip "Public RT exists: $PUB_RT"
fi
aws ec2 associate-route-table --route-table-id "$PUB_RT" --subnet-id "$PUB_A" 2>/dev/null || true
aws ec2 associate-route-table --route-table-id "$PUB_RT" --subnet-id "$PUB_B" 2>/dev/null || true

# Private RT A → NAT-A
PRIV_RT_A=$(find_by_name_tag route-table "${PROJECT}-RT-Private-A")
if [ -z "$PRIV_RT_A" ]; then
  PRIV_RT_A=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
    --query 'RouteTable.RouteTableId' --output text)
  aws ec2 create-tags --resources "$PRIV_RT_A" --tags Key=Name,Value=${PROJECT}-RT-Private-A
  aws ec2 create-route --route-table-id "$PRIV_RT_A" \
    --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_A" >/dev/null
  ok "Private RT A: $PRIV_RT_A"
else
  skip "Private RT A exists: $PRIV_RT_A"
fi
aws ec2 associate-route-table --route-table-id "$PRIV_RT_A" --subnet-id "$PRIV_A" 2>/dev/null || true

# Private RT B → NAT-B (or NAT-A if single-NAT mode)
NAT_FOR_B="${NAT_B:-$NAT_A}"
PRIV_RT_B=$(find_by_name_tag route-table "${PROJECT}-RT-Private-B")
if [ -z "$PRIV_RT_B" ]; then
  PRIV_RT_B=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
    --query 'RouteTable.RouteTableId' --output text)
  aws ec2 create-tags --resources "$PRIV_RT_B" --tags Key=Name,Value=${PROJECT}-RT-Private-B
  aws ec2 create-route --route-table-id "$PRIV_RT_B" \
    --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_FOR_B" >/dev/null
  ok "Private RT B: $PRIV_RT_B → NAT $NAT_FOR_B"
else
  skip "Private RT B exists: $PRIV_RT_B"
fi
aws ec2 associate-route-table --route-table-id "$PRIV_RT_B" --subnet-id "$PRIV_B" 2>/dev/null || true

# ── VPC Gateway Endpoints (free; bypasses NAT for S3/DynamoDB traffic) ───────
log "Creating VPC Gateway Endpoints for S3 and DynamoDB..."

create_gw_endpoint() {
  local SVC=$1
  local EXISTING
  EXISTING=$(aws ec2 describe-vpc-endpoints \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=com.amazonaws.${REGION}.${SVC}" \
    --query 'VpcEndpoints[0].VpcEndpointId' --output text 2>/dev/null | sed 's/None//')
  if [ -n "$EXISTING" ]; then
    skip "VPC endpoint for $SVC exists: $EXISTING"
    return
  fi
  aws ec2 create-vpc-endpoint \
    --vpc-id "$VPC_ID" \
    --service-name "com.amazonaws.${REGION}.${SVC}" \
    --route-table-ids "$PRIV_RT_A" "$PRIV_RT_B" \
    --query 'VpcEndpoint.VpcEndpointId' --output text >/dev/null
  ok "VPC endpoint for $SVC created"
}

create_gw_endpoint s3
create_gw_endpoint dynamodb

# ── Security Groups ───────────────────────────────────────────────────────────
log "Creating security groups..."

SG_ALB=$(find_by_name_tag security-group "${PROJECT}-sg-alb")
if [ -z "$SG_ALB" ]; then
  SG_ALB=$(aws ec2 create-security-group \
    --group-name ${PROJECT}-sg-alb \
    --description "ALB: allow HTTP and HTTPS from anywhere" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG_ALB" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0
  aws ec2 authorize-security-group-ingress --group-id "$SG_ALB" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0
  aws ec2 create-tags --resources "$SG_ALB" --tags Key=Name,Value=${PROJECT}-SG-ALB
  ok "SG ALB: $SG_ALB"
else
  skip "SG ALB exists: $SG_ALB"
fi

SG_EC2=$(find_by_name_tag security-group "${PROJECT}-sg-ec2")
if [ -z "$SG_EC2" ]; then
  SG_EC2=$(aws ec2 create-security-group \
    --group-name ${PROJECT}-sg-ec2 \
    --description "EC2 backend: allow port 3000 from ALB only" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG_EC2" \
    --protocol tcp --port 3000 --source-group "$SG_ALB"
  aws ec2 create-tags --resources "$SG_EC2" --tags Key=Name,Value=${PROJECT}-SG-EC2
  ok "SG EC2: $SG_EC2"
else
  skip "SG EC2 exists: $SG_EC2"
fi

# ─────────────────────────────────────────────────────────────────────────────
# IAM ROLES — least privilege
# ─────────────────────────────────────────────────────────────────────────────

EC2_TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
LAMBDA_TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

# Create-or-skip role.
ensure_role() {
  local NAME=$1
  local TRUST=$2
  if aws iam get-role --role-name "$NAME" >/dev/null 2>&1; then
    skip "Role exists: $NAME"
  else
    aws iam create-role --role-name "$NAME" \
      --assume-role-policy-document "$TRUST" >/dev/null
    ok "Created role: $NAME"
  fi
}

# Attach an inline policy (idempotent: put-role-policy is upsert).
put_inline() {
  local ROLE=$1
  local NAME=$2
  local DOC=$3
  aws iam put-role-policy --role-name "$ROLE" \
    --policy-name "$NAME" --policy-document "$DOC"
  ok "Inline policy '$NAME' on $ROLE"
}

attach_managed() {
  local ROLE=$1
  local POLICY=$2
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$POLICY"
}

# ── EC2 backend role ─────────────────────────────────────────────────────────
log "EC2 backend role..."
EC2_ROLE="${PROJECT}-role-ec2-backend"
ensure_role "$EC2_ROLE" "$EC2_TRUST"

# Cognito read-only is enough — backend only verifies JWTs and reads attrs.
attach_managed "$EC2_ROLE" arn:aws:iam::aws:policy/AmazonCognitoReadOnly
# CloudWatch agent (logs + PutMetricData).
attach_managed "$EC2_ROLE" arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

put_inline "$EC2_ROLE" "${PROJECT}-ec2-app-policy" "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBAppTables",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem",
        "dynamodb:Query","dynamodb:Scan","dynamodb:BatchGetItem","dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Users",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Users/index/*",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Teams",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Teams/index/*",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Projects",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Projects/index/*",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Tasks",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Tasks/index/*",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Comments",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Comments/index/*",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/StatusLogs",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/ActivityLogs"
      ]
    },
    {
      "Sid": "S3Buckets",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject","s3:GetObject","s3:DeleteObject","s3:ListBucket","s3:GetObjectVersion"
      ],
      "Resource": [
        "arn:aws:s3:::mini-jira-originals-*",
        "arn:aws:s3:::mini-jira-originals-*/*",
        "arn:aws:s3:::mini-jira-resized-*",
        "arn:aws:s3:::mini-jira-resized-*/*"
      ]
    },
    {
      "Sid": "SNSPublish",
      "Effect": "Allow",
      "Action": ["sns:Publish"],
      "Resource": "arn:aws:sns:${REGION}:${ACCOUNT_ID}:*"
    },
    {
      "Sid": "SQSSend",
      "Effect": "Allow",
      "Action": ["sqs:SendMessage","sqs:GetQueueUrl"],
      "Resource": "arn:aws:sqs:${REGION}:${ACCOUNT_ID}:*"
    },
    {
      "Sid": "CloudWatchCustomMetrics",
      "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricData"],
      "Resource": "*"
    }
  ]
}
JSON
)"

# Instance profile
if aws iam get-instance-profile --instance-profile-name "$EC2_ROLE" >/dev/null 2>&1; then
  skip "Instance profile exists: $EC2_ROLE"
else
  aws iam create-instance-profile --instance-profile-name "$EC2_ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$EC2_ROLE" --role-name "$EC2_ROLE"
  ok "Instance profile created and role attached"
fi

# ── Lambda: Image Resize ─────────────────────────────────────────────────────
log "Lambda role: image-resize..."
RESIZE_ROLE="${PROJECT}-role-lambda-image-resize"
ensure_role "$RESIZE_ROLE" "$LAMBDA_TRUST"
attach_managed "$RESIZE_ROLE" arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
put_inline "$RESIZE_ROLE" "${PROJECT}-resize-s3" "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject","s3:PutObject"],
    "Resource": [
      "arn:aws:s3:::mini-jira-originals-*/*",
      "arn:aws:s3:::mini-jira-resized-*/*"
    ]
  }]
}
JSON
)"

# ── Lambda: Assignment Worker ────────────────────────────────────────────────
log "Lambda role: assignment-worker..."
WORKER_ROLE="${PROJECT}-role-lambda-assignment-worker"
ensure_role "$WORKER_ROLE" "$LAMBDA_TRUST"
attach_managed "$WORKER_ROLE" arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
put_inline "$WORKER_ROLE" "${PROJECT}-worker-policy" "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage","sqs:DeleteMessage","sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:${REGION}:${ACCOUNT_ID}:*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem","dynamodb:UpdateItem"],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/ActivityLogs",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Tasks"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricData"],
      "Resource": "*"
    }
  ]
}
JSON
)"

# ── Lambda: Daily Digest ─────────────────────────────────────────────────────
log "Lambda role: daily-digest..."
DIGEST_ROLE="${PROJECT}-role-lambda-daily-digest"
ensure_role "$DIGEST_ROLE" "$LAMBDA_TRUST"
attach_managed "$DIGEST_ROLE" arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
put_inline "$DIGEST_ROLE" "${PROJECT}-digest-policy" "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:Scan","dynamodb:Query"],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Tasks",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/Tasks/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["sns:Publish"],
      "Resource": "arn:aws:sns:${REGION}:${ACCOUNT_ID}:*"
    }
  ]
}
JSON
)"

# IAM role/profile propagation can take a few seconds before EC2 launches.
echo "Waiting 10s for IAM propagation..."
sleep 10

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — COGNITO
# ─────────────────────────────────────────────────────────────────────────────

log "Creating Cognito User Pool..."
POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?Name=='${PROJECT}UserPool'].Id | [0]" --output text 2>/dev/null | sed 's/None//')

if [ -z "$POOL_ID" ]; then
  POOL_ID=$(aws cognito-idp create-user-pool \
    --pool-name ${PROJECT}UserPool \
    --policies '{
      "PasswordPolicy": {
        "MinimumLength": 8,
        "RequireUppercase": false,
        "RequireLowercase": false,
        "RequireNumbers": false,
        "RequireSymbols": false
      }
    }' \
    --schema '[
      {"Name":"role","AttributeDataType":"String","Mutable":true,"Required":false},
      {"Name":"teamId","AttributeDataType":"String","Mutable":true,"Required":false}
    ]' \
    --auto-verified-attributes email \
    --username-attributes email \
    --query 'UserPool.Id' --output text)
  ok "User Pool ID: $POOL_ID"
else
  skip "User Pool exists: $POOL_ID"
fi

log "Creating Cognito App Client..."
CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id "$POOL_ID" \
  --query "UserPoolClients[?ClientName=='${PROJECT}AppClient'].ClientId | [0]" \
  --output text 2>/dev/null | sed 's/None//')

if [ -z "$CLIENT_ID" ]; then
  CLIENT_ID=$(aws cognito-idp create-user-pool-client \
    --user-pool-id "$POOL_ID" \
    --client-name ${PROJECT}AppClient \
    --no-generate-secret \
    --explicit-auth-flows \
      ALLOW_USER_PASSWORD_AUTH \
      ALLOW_REFRESH_TOKEN_AUTH \
      ALLOW_USER_SRP_AUTH \
    --query 'UserPoolClient.ClientId' --output text)
  ok "App Client ID: $CLIENT_ID"
else
  skip "App Client exists: $CLIENT_ID"
fi

# ── Demo Users ────────────────────────────────────────────────────────────────
# With --username-attributes email set on the pool, the username MUST be the
# email address. Sign-in form should also collect email.
log "Creating demo users..."

create_user() {
  local EMAIL=$1
  local PASSWORD=$2
  local ROLE=$3
  local TEAM_ID=$4

  if aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username "$EMAIL" >/dev/null 2>&1; then
    skip "User exists: $EMAIL"
    return
  fi

  aws cognito-idp admin-create-user \
    --user-pool-id "$POOL_ID" \
    --username "$EMAIL" \
    --user-attributes \
      Name=email,Value="$EMAIL" \
      Name=email_verified,Value=true \
      Name=custom:role,Value="$ROLE" \
      Name=custom:teamId,Value="$TEAM_ID" \
    --message-action SUPPRESS >/dev/null

  aws cognito-idp admin-set-user-password \
    --user-pool-id "$POOL_ID" \
    --username "$EMAIL" \
    --password "$PASSWORD" \
    --permanent

  ok "Created user: $EMAIL ($ROLE, team: '$TEAM_ID')"
}

create_user "$MANAGER_EMAIL"        "$MANAGER_PASSWORD"        "manager"  ""
create_user "$EMPLOYEE_SARA_EMAIL"  "$EMPLOYEE_SARA_PASSWORD"  "employee" "team-frontend"
create_user "$EMPLOYEE_OMAR_EMAIL"  "$EMPLOYEE_OMAR_PASSWORD"  "employee" "team-backend"

# ─────────────────────────────────────────────────────────────────────────────
# OUTPUT — Save all IDs to .env file
# ─────────────────────────────────────────────────────────────────────────────

log "Writing environment variables to aws-output.env..."

cat > aws-output.env <<EOF
# ── Generated by aws-setup-phase1-2.sh ──────────────────────────────────────
# Copy these into your backend/.env and frontend/.env.local files.
# !! DO NOT COMMIT THIS FILE — it contains demo passwords.

AWS_REGION=$REGION
AWS_ACCOUNT_ID=$ACCOUNT_ID

# VPC & Networking
VPC_ID=$VPC_ID
IGW_ID=$IGW_ID
PUBLIC_SUBNET_A=$PUB_A
PUBLIC_SUBNET_B=$PUB_B
PRIVATE_SUBNET_A=$PRIV_A
PRIVATE_SUBNET_B=$PRIV_B
NAT_GATEWAY_A=$NAT_A
NAT_GATEWAY_B=${NAT_B:-}
ROUTE_TABLE_PUBLIC=$PUB_RT
ROUTE_TABLE_PRIVATE_A=$PRIV_RT_A
ROUTE_TABLE_PRIVATE_B=$PRIV_RT_B

# Security Groups
SG_ALB=$SG_ALB
SG_EC2=$SG_EC2

# Cognito
COGNITO_USER_POOL_ID=$POOL_ID
COGNITO_CLIENT_ID=$CLIENT_ID

# Demo credentials — DO NOT SHARE. Sign in with the EMAIL, not a username.
DEMO_MANAGER_EMAIL=$MANAGER_EMAIL
DEMO_MANAGER_PASSWORD=$MANAGER_PASSWORD
DEMO_SARA_EMAIL=$EMPLOYEE_SARA_EMAIL
DEMO_SARA_PASSWORD=$EMPLOYEE_SARA_PASSWORD
DEMO_OMAR_EMAIL=$EMPLOYEE_OMAR_EMAIL
DEMO_OMAR_PASSWORD=$EMPLOYEE_OMAR_PASSWORD

# ── Fill these in during later phases ────────────────────────────────────────
S3_ORIGINALS_BUCKET=
S3_RESIZED_BUCKET=
SNS_TASK_ASSIGNMENT_TOPIC_ARN=
SQS_ASSIGNMENT_QUEUE_URL=
CLOUDFRONT_DISTRIBUTION_URL=
ALB_DNS_NAME=
EOF

chmod 600 aws-output.env
ok "Saved to aws-output.env (mode 600)"

# Make sure it's gitignored
if [ -f .gitignore ] && ! grep -qx "aws-output.env" .gitignore; then
  echo "aws-output.env" >> .gitignore
  ok "Added aws-output.env to .gitignore"
fi

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  Phase 1 & 2 Complete — Summary"
echo "============================================================"
echo "  Region:             $REGION"
echo "  VPC ID:             $VPC_ID"
echo "  Public Subnet A:    $PUB_A  ($AZ_A)"
echo "  Public Subnet B:    $PUB_B  ($AZ_B)"
echo "  Private Subnet A:   $PRIV_A ($AZ_A)"
echo "  Private Subnet B:   $PRIV_B ($AZ_B)"
echo "  NAT mode:           $([ "$DUAL_NAT" = "true" ] && echo 'dual (HA)' || echo 'single (cost-saver)')"
echo "  SG ALB:             $SG_ALB"
echo "  SG EC2:             $SG_EC2"
echo "  Cognito Pool ID:    $POOL_ID"
echo "  Cognito Client ID:  $CLIENT_ID"
echo "  Demo users:         $MANAGER_EMAIL / $EMPLOYEE_SARA_EMAIL / $EMPLOYEE_OMAR_EMAIL"
echo "============================================================"
echo "  All values saved to: aws-output.env"
echo "  Next step: Phase 3 — Backend API on EC2"
echo "============================================================"
