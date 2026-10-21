#!/usr/bin/env bash
set -euo pipefail
# Pass a disposable Postgres container name; creates two isolated databases.
container="${1:?disposable Postgres container required}"
repo="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$repo"
for baseline in legacy deployment-baseline; do
  database="asl_replay_${baseline//-/_}_$$"
  docker exec "$container" createdb -U postgres "$database"
  docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$database" <<'SQL' >/dev/null
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
SQL
  for sql in "supabase/fixtures/$baseline.sql"; do
    docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$database" < "$sql" >/dev/null
  done
  for sql in supabase/migrations/*.sql; do
    if [[ "$sql" == *asl_normalized.sql ]]; then
      if [[ "$baseline" == deployment-baseline ]]; then
        docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$database" < api/test/integration/asl-migration-seed.sql >/dev/null
      fi
      aliases='{}'
      if [[ "$baseline" == deployment-baseline ]]; then aliases='{"OldAlice":"11111111-1111-4111-8111-111111111111"}'; fi
      exclusions=""
      if [[ "$baseline" == deployment-baseline ]]; then
        exclusions="SET asl_migration.excluded_team_ids = '[\"excluded-test-team\"]'; SET asl_migration.excluded_vote_ids = '[\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\"]';"
      fi
      { printf '%s\n' "$exclusions"; printf '%s\n' "SET asl_migration.account_aliases = '$aliases';"; cat "$sql"; cat api/test/integration/asl-preservation.sql; } |
        docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$database" >/dev/null
    else
      docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$database" < "$sql" >/dev/null
    fi
  done
  docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d "$database" < api/test/integration/asl-migration.sql >/dev/null
  docker exec "$container" dropdb -U postgres "$database"
done
