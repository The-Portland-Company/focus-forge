#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p logs

SERVICE_NAME="app"
ENV_NAME="production"
TRIGGER="none" # none|redeploy|push
RETRIES="0"

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

trigger_deploy() {
  case "${TRIGGER}" in
    none)
      return 0
      ;;
    redeploy)
      railway redeploy >/dev/null
      ;;
    push)
      git push origin HEAD:main >/dev/null
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

capture_logs() {
  local deploy_id="$1"
  local stamp
  stamp="$(ts)"

  local build_path="logs/railway-build-${deploy_id}-${stamp}.jsonl"
  local deploy_path="logs/railway-deploy-${deploy_id}-${stamp}.jsonl"

  railway logs -b "${deploy_id}" --json | tee "${build_path}" >/dev/null
  railway logs -d "${deploy_id}" --json | tee "${deploy_path}" >/dev/null

  ln -sf "$(basename "${build_path}")" logs/railway-build-latest.jsonl
  ln -sf "$(basename "${deploy_path}")" logs/railway-deploy-latest.jsonl

  echo "${build_path} ${deploy_path}"
}

is_success() {
  local build_path="$1"
  if rg -n "Healthcheck failed|replicas never became healthy|Build failed" "${build_path}" >/dev/null; then
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

  if [[ "${TRIGGER}" == "none" ]]; then
    new_id="${before_id}"
  else
    new_id="$(wait_for_new_deploy "${before_id}")"
    echo "New deployment: ${new_id}"
  fi

  read -r build_path deploy_path < <(capture_logs "${new_id}")

  if is_success "${build_path}"; then
    echo "Result: success"
    exit 0
  fi

  echo "Result: failed (see ${build_path})"
  if [[ "${attempt}" -ge $((RETRIES + 1)) ]]; then
    exit 1
  fi
done
