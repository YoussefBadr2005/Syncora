#!/bin/bash
# Deletes the NAT Gateway(s) to stop billing (~$0.045/hr each).
# Run this when done working for the day.
# Re-create with: ./nat-start.sh

set -euo pipefail

if [ ! -f aws-output.env ]; then
  echo "ERROR: aws-output.env not found."
  exit 1
fi
set -a; source aws-output.env; set +a

export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""

log()  { echo -e "\n\033[1;34m>>> $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $1\033[0m"; }
skip() { echo -e "\033[1;33m↺  $1\033[0m"; }

delete_nat() {
  local NAT_ID=$1
  local LABEL=$2
  if [ -z "$NAT_ID" ]; then
    skip "$LABEL: not set in aws-output.env"
    return
  fi

  STATE=$(aws ec2 describe-nat-gateways --nat-gateway-ids "$NAT_ID" \
    --query 'NatGateways[0].State' --output text 2>/dev/null || echo "not-found")

  case "$STATE" in
    deleted|deleting)
      skip "$LABEL already deleted/deleting: $NAT_ID" ;;
    not-found)
      skip "$LABEL not found: $NAT_ID" ;;
    *)
      log "Deleting $LABEL: $NAT_ID (state: $STATE)..."
      aws ec2 delete-nat-gateway --nat-gateway-id "$NAT_ID" >/dev/null
      ok "$LABEL deletion initiated — billing stops within a few minutes"
      ;;
  esac
}

delete_nat "${NAT_GATEWAY_A:-}" "NAT Gateway A"
delete_nat "${NAT_GATEWAY_B:-}" "NAT Gateway B"

# Release Elastic IPs associated with the NAT Gateways
# (EIPs cost $0.005/hr when NOT attached — release them too)
log "Releasing unattached Elastic IPs..."
UNATTACHED=$(aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null].AllocationId' \
  --output text 2>/dev/null)

if [ -z "$UNATTACHED" ]; then
  skip "No unattached Elastic IPs found"
else
  for ALLOC_ID in $UNATTACHED; do
    aws ec2 release-address --allocation-id "$ALLOC_ID"
    ok "Released EIP: $ALLOC_ID"
  done
fi

echo ""
echo "============================================================"
echo "  NAT Gateway stopped. Saving ~\$1.08/day."
echo "  Private subnets have no outbound internet until restarted."
echo "  Restart with: ./nat-start.sh"
echo "============================================================"
