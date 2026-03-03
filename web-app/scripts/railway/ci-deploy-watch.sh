#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p logs

WORKFLOW_FILE=".github/workflows/railway-deploy.yml"
REF="main"
RETRIES="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      REF="${2:-}"
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

run_workflow() {
  gh workflow run "${WORKFLOW_FILE}" --ref "${REF}" >/dev/null
}

latest_run_json() {
  gh run list --workflow "${WORKFLOW_FILE}" --limit 1 --json databaseId,status,conclusion,htmlUrl,headSha,createdAt
}

wait_for_completion() {
  local json status conclusion url run_id
  while true; do
    json="$(latest_run_json)"
    run_id="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j[0]?.databaseId||"")' "${json}")"
    status="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j[0]?.status||"")' "${json}")"
    conclusion="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j[0]?.conclusion||"")' "${json}")"
    url="$(node -e 'const j=JSON.parse(process.argv[1]);console.log(j[0]?.htmlUrl||"")' "${json}")"

    if [[ -n "${url}" ]]; then
      echo "GitHub run: ${url}"
    fi

    if [[ "${status}" == "completed" ]]; then
      echo "${run_id} ${conclusion}"
      return 0
    fi

    sleep 5
  done
}

download_and_backfeed() {
  local run_id="$1"
  local out_dir="/tmp/railway-logs-${run_id}-$(ts)"
  mkdir -p "${out_dir}"

  gh run download "${run_id}" -n railway-logs -D "${out_dir}" >/dev/null || true

  local merged="logs/railway-ci-${run_id}-$(ts).log"
  {
    echo "=== GH RUN ${run_id} ==="
    echo "=== DOWNLOADED AT $(date -Iseconds) ==="
    ls -la "${out_dir}" || true
    echo
    for f in "${out_dir}"/logs/railway-up-attempt-*.log; do
      [[ -f "${f}" ]] || continue
      echo "----- ${f##*/} -----"
      cat "${f}"
      echo
    done
    if [[ -f "${out_dir}/logs/railway-status.json" ]]; then
      echo "----- railway-status.json -----"
      cat "${out_dir}/logs/railway-status.json"
      echo
    fi
  } >> "${merged}"

  ln -sf "$(basename "${merged}")" logs/railway-ci-latest.log
  echo "Backfed: ${merged}"
}

attempt=0
while true; do
  attempt=$((attempt + 1))
  echo "Triggering Railway deploy via GitHub (attempt ${attempt})"
  run_workflow

  read -r run_id conclusion < <(wait_for_completion)
  download_and_backfeed "${run_id}"

  if [[ "${conclusion}" == "success" ]]; then
    echo "Result: success"
    exit 0
  fi

  echo "Result: ${conclusion}"
  if [[ "${attempt}" -gt $((RETRIES + 1)) ]]; then
    exit 1
  fi

  echo "Retrying..."
done

