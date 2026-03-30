#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p logs

SERVICE_NAME="app"
ENV_NAME="production"
TRIGGER="none" # none|redeploy|push
RETRIES="0"
TARGET_COMMIT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      SERVICE_NAME="${2:-}"
      shift 2
      ;;
    --env)
      ENV_NAME="${2:-}"
      shift 2
      ;;
    --trigger)
      TRIGGER="${2:-none}"
      shift 2
      ;;
    --retries)
      RETRIES="${2:-0}"
      shift 2
      ;;
    --target-commit)
      TARGET_COMMIT="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

ts() { date +"%Y%m%d-%H%M%S"; }

latest_json() {
  railway status --json | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      const status = JSON.parse(s);
      const envName = process.env.ENV_NAME;
      const serviceName = process.env.SERVICE_NAME;

      const envNode =
        status.environments?.edges?.map((e) => e?.node).find((n) => n?.name === envName) || null;
      const instNode =
        envNode?.serviceInstances?.edges?.map((e) => e?.node).find((n) => n?.serviceName === serviceName) || null;

      const d = instNode?.latestDeployment || null;
      const out = {
        deploymentId: d?.id || "",
        commitHash: d?.meta?.commitHash || "",
        commitMessage: d?.meta?.commitMessage || "",
        queuedReason: d?.meta?.queuedReason || "",
      };
      process.stdout.write(JSON.stringify(out));
    });
  '
}

export SERVICE_NAME ENV_NAME

if [[ -z "${TARGET_COMMIT}" ]]; then
  TARGET_COMMIT="$(git rev-parse HEAD)"
fi

deployment_for_commit_json() {
  railway deployment list -s "${SERVICE_NAME}" -e "${ENV_NAME}" --limit 100 --json | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      const deployments = JSON.parse(s);
      const target = process.env.TARGET_COMMIT;
      const match = (deployments || []).find((d) => d?.meta?.commitHash === target) || null;
      const out = {
        deploymentId: match?.id || "",
        status: match?.status || "",
        skippedReason: match?.meta?.skippedReason || "",
        createdAt: match?.createdAt || "",
        commitHash: match?.meta?.commitHash || "",
        commitMessage: match?.meta?.commitMessage || "",
      };
      process.stdout.write(JSON.stringify(out));
    });
  '
}

export TARGET_COMMIT

trigger_deploy() {
  case "${TRIGGER}" in
    none)
      return 0
      ;;
    redeploy)
      railway redeploy >/dev/null
      ;;
    push)
      git push origin HEAD:production >/dev/null
      ;;
    *)
      echo "Invalid --trigger: ${TRIGGER} (expected none|redeploy|push)" >&2
      exit 2
      ;;
  esac
}

wait_for_new_deploy() {
  local before_id="$1"
  local start_epoch now_epoch json id
  start_epoch="$(date +%s)"

  while true; do
    json="$(latest_json)"
    id="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.deploymentId||"")' "${json}")"
    if [[ -n "${id}" && "${id}" != "${before_id}" ]]; then
      echo "${id}"
      return 0
    fi

    now_epoch="$(date +%s)"
    if (( now_epoch - start_epoch > 900 )); then
      echo "Timed out waiting for a new deployment id" >&2
      return 1
    fi

    sleep 5
  done
}

wait_for_target_commit() {
  local target="$1"
  local start_epoch now_epoch json id commit msg
  start_epoch="$(date +%s)"

  while true; do
    json="$(deployment_for_commit_json)"
    id="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.deploymentId||"")' "${json}")"
    status="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.status||"")' "${json}")"
    reason="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.skippedReason||"")' "${json}")"
    msg="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.commitMessage||"")' "${json}")"

    if [[ -n "${id}" ]]; then
      echo "Deployment: ${id} status=${status} ${msg} ${reason}" >&2
    else
      echo "Waiting for deployment record for commit ${target}" >&2
    fi

    if [[ -n "${id}" ]]; then
      if [[ "${status}" == "SKIPPED" ]]; then
        echo "Deployment was skipped: ${reason}" >&2
        return 1
      fi
      echo "${id}"
      return 0
    fi

    now_epoch="$(date +%s)"
    if (( now_epoch - start_epoch > 1800 )); then
      echo "Timed out waiting for deployment of commit ${target}" >&2
      return 1
    fi

    sleep 10
  done
}

capture_logs() {
  local deploy_id="$1"
  local stamp
  stamp="$(ts)"

  local build_path="logs/railway-build-${deploy_id}-${stamp}.jsonl"
  local deploy_path="logs/railway-deploy-${deploy_id}-${stamp}.jsonl"

  local start_epoch now_epoch
  start_epoch="$(date +%s)"

  while true; do
    set +e
    railway logs -b "${deploy_id}" --json 2>&1 | tee "${build_path}" >/dev/null
    rc="${PIPESTATUS[0]}"
    set -e

    if [[ "${rc}" -eq 0 ]]; then
      break
    fi

    if rg -n "Deployment does not have an associated build" "${build_path}" >/dev/null; then
      : > "${build_path}"
      # Build hasn't started yet (WAITING/QUEUED). Keep polling.
      sleep 10
      continue
    fi

    if rg -n "Deployment not found|Deployment id does not exist" "${build_path}" >/dev/null; then
      : > "${build_path}"
    else
      echo "Build logs failed (exit ${rc}). See ${build_path}" >&2
      return "${rc}"
    fi

    now_epoch="$(date +%s)"
    if (( now_epoch - start_epoch > 1800 )); then
      echo "Timed out waiting for build logs for ${deploy_id}" >&2
      return 1
    fi

    sleep 10
  done

  start_epoch="$(date +%s)"
  while true; do
    set +e
    railway logs -d "${deploy_id}" --json 2>&1 | tee "${deploy_path}" >/dev/null
    rc="${PIPESTATUS[0]}"
    set -e

    if [[ "${rc}" -eq 0 ]]; then
      break
    fi

    if rg -n "Deployment not found|Deployment id does not exist" "${deploy_path}" >/dev/null; then
      : > "${deploy_path}"
    else
      echo "Deploy logs failed (exit ${rc}). See ${deploy_path}" >&2
      return "${rc}"
    fi

    now_epoch="$(date +%s)"
    if (( now_epoch - start_epoch > 1800 )); then
      echo "Timed out waiting for deploy logs for ${deploy_id}" >&2
      return 1
    fi

    sleep 10
  done

  ln -sf "$(basename "${build_path}")" logs/railway-build-latest.jsonl
  ln -sf "$(basename "${deploy_path}")" logs/railway-deploy-latest.jsonl

  echo "${build_path} ${deploy_path}"
}

is_success() {
  local build_path="$1"
  local deploy_path="$2"
  if rg -n "Healthcheck failed|replicas never became healthy|Build failed" "${build_path}" "${deploy_path}" >/dev/null; then
    return 1
  fi
  return 0
}

attempt=0
while true; do
  attempt=$((attempt + 1))

  before="$(latest_json)"
  before_id="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.deploymentId||"")' "${before}")"
  echo "Current deployment: ${before_id}"

  trigger_deploy

  if [[ "${TRIGGER}" != "none" ]]; then
    new_id="$(wait_for_new_deploy "${before_id}")"
    echo "New deployment: ${new_id}"
  fi

  new_id="$(wait_for_target_commit "${TARGET_COMMIT}")"

  read -r build_path deploy_path < <(capture_logs "${new_id}")

  if is_success "${build_path}" "${deploy_path}"; then
    echo "Result: success"
    exit 0
  fi

  echo "Result: failed (see ${build_path})"
  if [[ "${attempt}" -ge $((RETRIES + 1)) ]]; then
    exit 1
  fi
done
