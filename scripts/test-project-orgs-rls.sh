#!/usr/bin/env bash
# Multi-org project RLS tests against a THROWAWAY Postgres (never prod).
#
#   PGURL=postgres://postgres@127.0.0.1:5432 scripts/test-project-orgs-rls.sh
#
# Builds two scratch databases from the repo's migrations:
#   ff_before = every migration EXCEPT 20261028*   (the pre-change schema)
#   ff_after  = every migration                    (incl. the three new ones)
# then (1) diffs a parity snapshot of both (nothing shared => must be identical)
# and (2) runs supabase/tests/project_organizations_rls.test.sql on ff_after.
# supabase/tests/bootstrap.sql stubs the Supabase roles / auth.uid().
set -uo pipefail
cd "$(dirname "$0")/.."
PGURL="${PGURL:?set PGURL to a scratch server, e.g. postgres://postgres@127.0.0.1:5432}"
T="${TMPDIR:-/tmp}"
psql_db() { local db="$1"; shift; psql "$PGURL/$db" -X -q "$@"; }
all_files() { ls api/supabase/migrations/*.sql supabase/migrations/*.sql web-app/supabase/migrations/*.sql \
  | awk -F/ '{print $NF" "$0}' | sort | awk '{print $2}' | grep -v tpc_auth_deferred_drop; }
files_before() { all_files | grep -v '/20261028'; }

build() { # db, file-list-fn
  local db="$1" fn="$2" f stop
  psql "$PGURL/postgres" -X -q -c "drop database if exists $db" -c "create database $db" || exit 1
  psql_db "$db" -f supabase/tests/bootstrap.sql >/dev/null 2>&1
  for f in $($fn); do
    stop=1; case "$f" in *remote_schema*) stop=0;; esac
    if ! psql_db "$db" -v ON_ERROR_STOP=$stop -f "$f" >/dev/null 2>&1; then
      case "$f" in */20261028*) echo "FATAL: $f failed on $db"; exit 1;; esac
      echo "  note: $f did not apply on scratch db (extensions/publications missing locally); ignored"
    fi
  done
}
echo "== building ff_before / ff_after"; build ff_before files_before; build ff_after all_files

echo "== 1. parity (nothing shared => before and after must be identical)"
psql_db ff_before -At -f supabase/tests/project_organizations_parity.sql > "$T/ff_parity_before.txt" 2>"$T/ff_parity_before.err"
psql_db ff_after  -At -f supabase/tests/project_organizations_parity.sql > "$T/ff_parity_after.txt"  2>"$T/ff_parity_after.err"
wc -l "$T/ff_parity_before.txt" "$T/ff_parity_after.txt"
grep -q SNAPSHOT "$T/ff_parity_before.txt" || { echo "FAIL: parity snapshot did not run"; cat "$T/ff_parity_before.err"; exit 1; }
if diff "$T/ff_parity_before.txt" "$T/ff_parity_after.txt"; then echo "PARITY OK"; else echo "PARITY FAILED"; exit 1; fi

echo "== 2. shared-project assertions"
if psql_db ff_after -v ON_ERROR_STOP=1 -f supabase/tests/project_organizations_rls.test.sql; then echo "RLS TESTS OK"; else echo "RLS TESTS FAILED"; exit 1; fi
