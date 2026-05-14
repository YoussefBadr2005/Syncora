#!/usr/bin/env bash
set -euo pipefail

# Single-key tables: partition key only
declare -A SINGLE_KEY=(
  [Users]=userId
  [Teams]=teamId
  [Projects]=projectId
  [StatusLogs]=logId
  [ActivityLogs]=logId
)

# Composite-key tables: partition + sort
declare -A COMPOSITE_KEY=(
  [Tasks]="taskId projectId"
  [Comments]="commentId taskId"
)

wipe_single() {
  local table=$1 key=$2
  echo "=== Wiping $table (key: $key) ==="
  local items
  items=$(aws dynamodb scan --table-name "$table" \
    --projection-expression "#k" \
    --expression-attribute-names "{\"#k\":\"$key\"}" \
    --query "Items[].$key.S" --output text | tr -d '\r')
  if [ -z "$items" ]; then
    echo "  (empty)"
    return
  fi
  while read -r v; do
    [ -z "$v" ] && continue
    aws dynamodb delete-item --table-name "$table" \
      --key "{\"$key\":{\"S\":\"$v\"}}"
    echo "  deleted $v"
  done <<< "$items"
}

wipe_composite() {
  local table=$1 pk=$2 sk=$3
  echo "=== Wiping $table (keys: $pk, $sk) ==="
  local items
  items=$(aws dynamodb scan --table-name "$table" \
    --projection-expression "#p,#s" \
    --expression-attribute-names "{\"#p\":\"$pk\",\"#s\":\"$sk\"}" \
    --query "Items[].[$pk.S,$sk.S]" --output text | tr -d '\r')
  if [ -z "$items" ]; then
    echo "  (empty)"
    return
  fi
  while read -r pv sv; do
    [ -z "$pv" ] && continue
    aws dynamodb delete-item --table-name "$table" \
      --key "{\"$pk\":{\"S\":\"$pv\"},\"$sk\":{\"S\":\"$sv\"}}"
    echo "  deleted $pv / $sv"
  done <<< "$items"
}

for t in "${!SINGLE_KEY[@]}"; do
  wipe_single "$t" "${SINGLE_KEY[$t]}"
done

for t in "${!COMPOSITE_KEY[@]}"; do
  read -r pk sk <<< "${COMPOSITE_KEY[$t]}"
  wipe_composite "$t" "$pk" "$sk"
done

echo "Done."
