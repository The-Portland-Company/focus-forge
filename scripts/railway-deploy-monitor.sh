#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="app"
ENV_NAME="production"
POLL_SECONDS=20
ATTEMPT_LOG="logs/railway-deploy-attempts.md"
BUILD_LOG="logs/railway-build.log"
DEPLOY_LOG="logs/railway-deploy.log"

mkdir -p logs

timestamp() {
  date -u "+%Y-%m-%dT%H:%M:%SZ"
}

append_attempt() {
  local status="$1"
  local deployment_id="$2"
  local note="$3"
  printf -- "- %s | %s | %s | %s\n" "$(timestamp)" "$deployment_id" "$status" "$note" >> "$ATTEMPT_LOG"
}

get_status_json() {
  railway status --json
}

parse_status() {
  node -e "
    let s='';
    process.stdin.on('data',d=>s+=d).on('end',()=>{
      const j=JSON.parse(s);
      const d=j.services.edges[0].node.serviceInstances.edges[0].node.latestDeployment;
      const out={
        id:d.id,
        canRedeploy:d.canRedeploy,
        queuedReason:(d.meta && d.meta.queuedReason) ? d.meta.queuedReason : '',
        reason:(d.meta && d.meta.reason) ? d.meta.reason : ''
      };
      console.log(JSON.stringify(out));
    });
  "
}

echo "[$(timestamp)] Triggering redeploy for ${SERVICE_NAME}/${ENV_NAME}"
railway redeploy -s "$SERVICE_NAME" -y >/dev/null

status_json="$(get_status_json | parse_status)"
deployment_id="$(printf '%s' "$status_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.id);});")"
append_attempt "queued" "$deployment_id" "redeploy triggered"

echo "[$(timestamp)] Monitoring deployment ${deployment_id}"

while true; do
  status_json="$(get_status_json | parse_status)"
  deployment_id="$(printf '%s' "$status_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.id);});")"
  queued_reason="$(printf '%s' "$status_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.queuedReason || '');});")"

  printf "[%s] deployment=%s queuedReason=%s\n" "$(timestamp)" "$deployment_id" "${queued_reason:-none}"

  # Try to snapshot logs without blocking (hard timeout)
  perl -e 'local $SIG{ALRM}=sub{exit 0}; alarm 10; open my $fh, "-|", @ARGV or exit 0; my $i=0; while(<$fh>){print; $i++; last if $i>=200} ' railway logs -b --json > "$BUILD_LOG" 2>/dev/null || true
  perl -e 'local $SIG{ALRM}=sub{exit 0}; alarm 10; open my $fh, "-|", @ARGV or exit 0; my $i=0; while(<$fh>){print; $i++; last if $i>=200} ' railway logs -d --json > "$DEPLOY_LOG" 2>/dev/null || true

  if rg -n "Build error occurred|ERROR: failed to build|Failed to compile" "$BUILD_LOG" >/dev/null 2>&1; then
    append_attempt "failed" "$deployment_id" "build failed (see $BUILD_LOG)"
    echo "[$(timestamp)] Build failed. Logs saved to $BUILD_LOG"
    exit 1
  fi

  if rg -n "ready|listening|server started|Started" "$DEPLOY_LOG" >/dev/null 2>&1; then
    append_attempt "succeeded" "$deployment_id" "runtime started (see $DEPLOY_LOG)"
    echo "[$(timestamp)] Deployment appears successful"
    exit 0
  fi

  sleep "$POLL_SECONDS"
done
