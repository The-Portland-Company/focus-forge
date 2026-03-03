#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p logs

SERVICE_NAME="app"
ENV_NAME="production"

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
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

ts() { date +"%Y%m%d-%H%M%S"; }

latest_deploy_json() {
  railway deployment list -s "${SERVICE_NAME}" -e "${ENV_NAME}" --limit 1 --json | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      const arr = JSON.parse(s);
      const d = arr?.[0] || null;
      process.stdout.write(JSON.stringify({
        id: d?.id || "",
        status: d?.status || "",
        createdAt: d?.createdAt || "",
        commit: d?.meta?.commitHash || "",
        message: d?.meta?.commitMessage || "",
      }));
    });
  '
}

deployment_status_json() {
  local deploy_id="$1"
  railway deployment list -s "${SERVICE_NAME}" -e "${ENV_NAME}" --limit 50 --json | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      const arr = JSON.parse(s);
      const id = process.env.DEPLOY_ID;
      const d = (arr || []).find((x) => x?.id === id) || null;
      process.stdout.write(JSON.stringify({
        id,
        status: d?.status || "",
        createdAt: d?.createdAt || "",
        commit: d?.meta?.commitHash || "",
        message: d?.meta?.commitMessage || "",
        skippedReason: d?.meta?.skippedReason || "",
      }));
    });
  '
}

is_terminal() {
  case "$1" in
    SUCCESS|FAILED|CRASHED|REMOVED|SKIPPED) return 0 ;;
    *) return 1 ;;
  esac
}

latest="$(latest_deploy_json)"
deploy_id="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.id)' "${latest}")"
deploy_status="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.status)' "${latest}")"
deploy_commit="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.commit)' "${latest}")"
deploy_msg="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.message)' "${latest}")"

if [[ -z "${deploy_id}" ]]; then
  echo "No deployments found for ${SERVICE_NAME}/${ENV_NAME}" >&2
  exit 1
fi

stamp="$(ts)"
build_log="logs/railway-build-${deploy_id}-${stamp}.jsonl"
deploy_log="logs/railway-deploy-${deploy_id}-${stamp}.jsonl"
status_log="logs/railway-status-${deploy_id}-${stamp}.log"

echo "Monitoring ${SERVICE_NAME}/${ENV_NAME} deployment ${deploy_id} status=${deploy_status} commit=${deploy_commit} ${deploy_msg}"
echo "Monitoring ${SERVICE_NAME}/${ENV_NAME} deployment ${deploy_id} status=${deploy_status} commit=${deploy_commit} ${deploy_msg}" >> "${status_log}"

set +e
railway logs --build "${deploy_id}" --json 2>&1 | tee "${build_log}" >/dev/null &
pid_build=$!
railway logs --deployment "${deploy_id}" --json 2>&1 | tee "${deploy_log}" >/dev/null &
pid_deploy=$!
set -e

cleanup() {
  kill "${pid_build}" "${pid_deploy}" 2>/dev/null || true
}
trap cleanup EXIT

export DEPLOY_ID="${deploy_id}"

while true; do
  sj="$(deployment_status_json "${deploy_id}")"
  st="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.status||"")' "${sj}")"
  sr="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.skippedReason||"")' "${sj}")"

  echo "$(date -Iseconds) status=${st} ${sr}" >> "${status_log}"

  if is_terminal "${st}"; then
    echo "Terminal status: ${st} ${sr}"
    break
  fi

  sleep 5
done

ln -sf "$(basename "${build_log}")" logs/railway-build-latest.jsonl
ln -sf "$(basename "${deploy_log}")" logs/railway-deploy-latest.jsonl
ln -sf "$(basename "${status_log}")" logs/railway-status-latest.log

wait "${pid_build}" 2>/dev/null || true
wait "${pid_deploy}" 2>/dev/null || true

if [[ "${st}" != "SUCCESS" ]]; then
  exit 1
fi

