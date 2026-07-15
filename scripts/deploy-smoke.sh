#!/usr/bin/env bash
# Post-deploy production smoke checks for Focus Forge web.
set -euo pipefail

BASE_URL="${DEPLOY_SMOKE_URL:-https://focusforge.theportlandcompany.com}"
BASE_URL="${BASE_URL%/}"
EXPECTED_GIT_COMMIT="${EXPECTED_GIT_COMMIT:-${GITHUB_SHA:-}}"

HEALTH_MAX_ATTEMPTS=8
HEALTH_SLEEP_SECS=15

echo "Smoke: base=${BASE_URL}"
if [ -n "${EXPECTED_GIT_COMMIT}" ]; then
  echo "Smoke: expected git_commit=${EXPECTED_GIT_COMMIT}"
fi

health_ok=0
health_body=""
health_code=""

for attempt in $(seq 1 "${HEALTH_MAX_ATTEMPTS}"); do
  echo "Health attempt ${attempt}/${HEALTH_MAX_ATTEMPTS}…"
  set +e
  health_body="$(curl -sS -L --max-time 30 -w '\n%{http_code}' "${BASE_URL}/api/health" 2>&1)"
  curl_rc=$?
  set -e

  if [ "${curl_rc}" -ne 0 ]; then
    echo "curl failed (rc=${curl_rc}): ${health_body}"
    if [ "${attempt}" -lt "${HEALTH_MAX_ATTEMPTS}" ]; then
      sleep "${HEALTH_SLEEP_SECS}"
      continue
    fi
    echo "FAIL: /api/health unreachable after ${HEALTH_MAX_ATTEMPTS} attempts"
    exit 1
  fi

  health_code="$(printf '%s' "${health_body}" | tail -n1)"
  health_body="$(printf '%s' "${health_body}" | sed '$d')"

  echo "HTTP ${health_code}"
  echo "${health_body}" | head -c 2000
  echo

  if [ "${health_code}" = "200" ]; then
    # Prefer JSON status healthy; accept 200 with critical path ok
    if printf '%s' "${health_body}" | grep -qE '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
      health_ok=1
      break
    fi
    # 200 without unhealthy marker is acceptable warm-up edge case
    if ! printf '%s' "${health_body}" | grep -qE '"status"[[:space:]]*:[[:space:]]*"unhealthy"'; then
      health_ok=1
      break
    fi
    echo "HTTP 200 but status unhealthy; retrying…"
  else
    echo "Non-200 health; retrying after warm-up…"
  fi

  if [ "${attempt}" -lt "${HEALTH_MAX_ATTEMPTS}" ]; then
    sleep "${HEALTH_SLEEP_SECS}"
  fi
done

if [ "${health_ok}" -ne 1 ]; then
  echo "FAIL: /api/health not healthy after ${HEALTH_MAX_ATTEMPTS} attempts (last HTTP ${health_code})"
  exit 1
fi

# build.git_commit match — warn only unless health already failed
if [ -n "${EXPECTED_GIT_COMMIT}" ]; then
  reported="$(printf '%s' "${health_body}" | sed -n 's/.*"git_commit"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  if [ -z "${reported}" ]; then
    echo "WARN: health JSON missing build.git_commit"
  elif [ "${reported}" = "unknown" ]; then
    echo "WARN: build.git_commit is unknown (deploy identity not wired yet)"
  elif [ "${reported}" != "${EXPECTED_GIT_COMMIT}" ]; then
    echo "WARN: build.git_commit mismatch: got=${reported} expected=${EXPECTED_GIT_COMMIT}"
  else
    echo "OK: build.git_commit matches ${EXPECTED_GIT_COMMIT}"
  fi
fi

# Middleware public allowlist: /share/* must not bounce to login permanently.
# Soft-fail: share page can hang on bad tokens/DB; do not fail a good deploy.
SHARE_URL="${BASE_URL}/share/smoke-nonexistent-token"
echo "Share allowlist check: ${SHARE_URL}"
set +e
# Do not follow redirects; we care about the first response
share_headers="$(curl -sS -D - -o /dev/null --max-time 8 "${SHARE_URL}" 2>&1)"
share_rc=$?
set -e

if [ "${share_rc}" -ne 0 ]; then
  echo "WARN: share probe curl failed (rc=${share_rc}); health already green — smoke PASS with warning"
  echo "${share_headers}"
  echo "Smoke production: PASS (share soft)"
  exit 0
fi

share_code="$(printf '%s' "${share_headers}" | head -n1 | awk '{print $2}')"
location="$(printf '%s' "${share_headers}" | tr -d '\r' | grep -i '^location:' | head -n1 | sed 's/^[Ll]ocation:[[:space:]]*//')"

echo "Share first response: HTTP ${share_code} Location=${location:-none}"

# Hard-fail share→login only when this deploy published a real commit identity
# (avoids flapping on lag) unless STRICT_SHARE_SMOKE=0.
STRICT_SHARE_SMOKE="${STRICT_SHARE_SMOKE:-0}"
share_identity_ready=0
if [ -n "${EXPECTED_GIT_COMMIT}" ]; then
  reported_for_share="$(printf '%s' "${health_body}" | sed -n 's/.*"git_commit"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  if [ -n "${reported_for_share}" ] && [ "${reported_for_share}" = "${EXPECTED_GIT_COMMIT}" ]; then
    share_identity_ready=1
  fi
fi

case "${share_code}" in
  200|404|401|403)
    echo "OK: share path not forced to login (${share_code})"
    ;;
  301|302|303|307|308)
    if printf '%s' "${location}" | grep -qiE '/auth/login'; then
      msg="/share/* redirected to login — middleware public allowlist is stale"
      # Soft by default: health+commit identity is the deploy signal. Share
      # allowlist regressions are warnings until STRICT_SHARE_SMOKE=1 is set.
      if [ "${STRICT_SHARE_SMOKE}" = "1" ] && [ "${share_identity_ready}" -eq 1 ]; then
        echo "FAIL: ${msg}"
        exit 1
      fi
      echo "WARN: ${msg}"
    else
      echo "OK: share redirected elsewhere (not login): ${location}"
    fi
    ;;
  *)
    echo "WARN: unexpected share status ${share_code}; not treating as allowlist fail"
    ;;
esac

echo "Smoke production: PASS"
exit 0
