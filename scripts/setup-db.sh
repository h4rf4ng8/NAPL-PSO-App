#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
sql_file="$(mktemp)"
trap 'rm -f "$sql_file"' EXIT

psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS local_dev;
REVOKE ALL ON SCHEMA local_dev FROM PUBLIC;
CREATE TABLE IF NOT EXISTS local_dev.migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

for migration in supabase/fixtures/legacy.sql supabase/migrations/*.sql supabase/local-seed.sql; do
  ledger_name="$migration"
  # Preserve the seed identity so existing local databases are not seeded twice.
  if [ "$migration" = supabase/local-seed.sql ]; then
    ledger_name=dev/auth/seed.sql
  fi
  applied="$(psql -X -At -v ON_ERROR_STOP=1 -v migration="$ledger_name" <<'SQL'
SELECT EXISTS (SELECT FROM local_dev.migrations WHERE name = :'migration');
SQL
)"
  if [ "$applied" = t ]; then
    continue
  fi
  printf 'Applying %s\n' "$migration"
  # Keep each migration and its ledger entry in the same transaction.
  {
    printf 'BEGIN;\n'
    sed '/^BEGIN;$/d; /^COMMIT;$/d' "$migration"
    printf '\n'
    cat <<'SQL'
INSERT INTO local_dev.migrations(name) VALUES (:'migration');
COMMIT;
SQL
  } > "$sql_file"
  psql -X -v ON_ERROR_STOP=1 -v migration="$ledger_name" -f "$sql_file"
done
