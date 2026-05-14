#!/bin/bash
# Recreates the NAT Gateway(s) before running Phase 9 or deploying to EC2.
# Run this when starting a work session that needs EC2 outbound internet.

set -euo pipefail

if [ ! -f aws-output.env ]; then
  echo "ERROR: aws-output.env not found."
  exit 1
fi
set -a; source aws-output.env; set +a

export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""

DUAL_NAT="${DUAL_NAT:-false}"

log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

nat_exists() {
  local NAT_ID=$1
  [ -z "$NAT_ID" ] && return 1
  STATE=$(aws ec2 describe-nat-gateways --nat-gateway-ids "$NAT_ID" \
    --query 'NatGateways[0].State' --output text 2>/dev/null || echo "not-found")
  [[ "$STATE" == "available" || "$STATE" == "pending" ]]
}

create_nat() {
  local SUBNET_ID=$1
  local ROUTE_TABLE_ID=$2
  local LABEL=$3

  log "Allocating Elastic IP for $LABEL..."
  EIP_ALLOC=$(aws ec2 allocate-address --domain vpc \
    --query 'AllocationId' --output text)
  ok "EIP allocated: $EIP_ALLOC"

  log "Creating $LABEL in subnet $SUBNET_ID..."
  NAT_ID=$(aws ec2 create-nat-gateway \
    --subnet-id "$SUBNET_ID" \
    --allocation-id "$EIP_ALLOC" \
    --query 'NatGateway.NatGatewayId' \
    --output text)
  ok "$LABEL created: $NAT_ID — waiting for it to become available..."

  aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_ID"
  ok "$LABEL is available: $NAT_ID"

  # Update private route table default route
  log "Updating route table $ROUTE_TABLE_ID → $NAT_ID..."
  # Remove old default route if exists
  aws ec2 delete-route \
    --route-table-id "$ROUTE_TABLE_ID" \
    --destination-cidr-block "0.0.0.0/0" 2>/dev/null || true

  aws ec2 create-route \
    --route-table-id "$ROUTE_TABLE_ID" \
    --destination-cidr-block "0.0.0.0/0" \
    --nat-gateway-id "$NAT_ID" >/dev/null
  ok "Route table updated"

  echo "$NAT_ID"
}

# ── NAT Gateway A (always created) ───────────────────────────────────────────
if nat_exists "${NAT_GATEWAY_A:-}"; then
  skip "NAT Gateway A already available: $NAT_GATEWAY_A"
  NEW_NAT_A="$NAT_GATEWAY_A"
else
  NEW_NAT_A=$(create_nat "$PUBLIC_SUBNET_A" "$ROUTE_TABLE_PRIVATE_A" "NAT Gateway A")
fi

# ── NAT Gateway B (only if DUAL_NAT=true) ────────────────────────────────────
NEW_NAT_B=""
if [ "$DUAL_NAT" = "true" ]; then
  if nat_exists "${NAT_GATEWAY_B:-}"; then
    skip "NAT Gateway B already available: $NAT_GATEWAY_B"
    NEW_NAT_B="$NAT_GATEWAY_B"
  else
    NEW_NAT_B=$(create_nat "$PUBLIC_SUBNET_B" "$ROUTE_TABLE_PRIVATE_B" "NAT Gateway B")
  fi
else
  # Single NAT: also route private subnet B through NAT A
  log "Single-NAT mode: routing private subnet B through NAT Gateway A..."
  aws ec2 delete-route \
    --route-table-id "$ROUTE_TABLE_PRIVATE_B" \
    --destination-cidr-block "0.0.0.0/0" 2>/dev/null || true
  aws ec2 create-route \
    --route-table-id "$ROUTE_TABLE_PRIVATE_B" \
    --destination-cidr-block "0.0.0.0/0" \
    --nat-gateway-id "$NEW_NAT_A" >/dev/null
  ok "Private subnet B routed through NAT Gateway A"
fi

# ── Update aws-output.env ─────────────────────────────────────────────────────
log "Updating aws-output.env..."
grep -v "^NAT_GATEWAY_A\|^NAT_GATEWAY_B" aws-output.env > aws-output.env.tmp || true
mv aws-output.env.tmp aws-output.env

sed -i "s/^NAT_GATEWAY_A=.*/NAT_GATEWAY_A=${NEW_NAT_A}/" aws-output.env 2>/dev/null || \
  sed -i '' "s/^NAT_GATEWAY_A=.*/NAT_GATEWAY_A=${NEW_NAT_A}/" aws-output.env 2>/dev/null || true

# Re-append if sed didn't find the line
grep -q "^NAT_GATEWAY_A=" aws-output.env || echo "NAT_GATEWAY_A=${NEW_NAT_A}" >> aws-output.env
grep -q "^NAT_GATEWAY_B=" aws-output.env || echo "NAT_GATEWAY_B=${NEW_NAT_B}" >> aws-output.env

chmod 600 aws-output.env
ok "aws-output.env updated"

echo ""
echo "============================================================"
echo "  NAT Gateway ready"
echo "  NAT A: $NEW_NAT_A"
[ -n "$NEW_NAT_B" ] && echo "  NAT B: $NEW_NAT_B"
echo ""
echo "  Private subnets now have outbound internet access."
echo "  Remember to run ./nat-stop.sh when done to save costs."
echo "============================================================"
