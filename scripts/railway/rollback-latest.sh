#!/usr/bin/env bash
# Roll production back to the last known-good deployment.
#
# Invoked by the deploy workflow when the post-deploy smoke check fails, so a
# build that deploys but does not come back healthy does not keep serving
# traffic. Safe to run by hand.
#
# Requires RAILWAY_TOKEN (project or account token) in the environment.
set -euo pipefail

PROJECT_ID="${RAILWAY_PROJECT_ID:-fbc264f9-bb98-4fbd-a7c6-ccbf3f728280}"
API="https://backboard.railway.com/graphql/v2"

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "rollback: RAILWAY_TOKEN not set — cannot roll back" >&2
  exit 1
fi

gql() {
  curl -sS --max-time 45 -X POST "$API" \
    -H "Authorization: Bearer ${RAILWAY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$1"
}

echo "rollback: listing recent deployments for project ${PROJECT_ID}"
DEPLOYMENTS=$(gql "{\"query\":\"query { deployments(first: 20, input: {projectId: \\\"${PROJECT_ID}\\\"}) { edges { node { id status createdAt canRedeploy } } } }\"}")

# The newest deployment is the one that just failed its smoke check. The target
# is the most recent *older* deployment that succeeded and can be redeployed.
TARGET=$(printf '%s' "$DEPLOYMENTS" | python3 -c '
import json, sys
data = json.load(sys.stdin)
edges = data.get("data", {}).get("deployments", {}).get("edges", [])
nodes = [e["node"] for e in edges]
if not nodes:
    sys.exit(0)
# Skip the current (newest) deployment, then take the first healthy candidate.
for node in nodes[1:]:
    if node.get("canRedeploy") and node.get("status") in ("SUCCESS", "REMOVED"):
        print(node["id"])
        break
')

if [ -z "$TARGET" ]; then
  echo "rollback: no previous deployment available to roll back to" >&2
  echo "$DEPLOYMENTS" >&2
  exit 1
fi

echo "rollback: rolling back to deployment ${TARGET}"
RESULT=$(gql "{\"query\":\"mutation { deploymentRollback(id: \\\"${TARGET}\\\") }\"}")
echo "rollback: response ${RESULT}"

if printf '%s' "$RESULT" | grep -q '"errors"'; then
  echo "rollback: FAILED — production may still be serving the bad build" >&2
  exit 1
fi

echo "rollback: requested successfully; production is returning to ${TARGET}"
