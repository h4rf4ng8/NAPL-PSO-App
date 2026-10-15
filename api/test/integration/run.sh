#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$repo"
npm run build -w @napl/contracts
npm run build -w @napl/api
db_container="napl-api-check-$$"
test_network="napl-check-$$"
trap 'docker rm -f "$db_container" >/dev/null 2>&1 || true; docker network rm "$test_network" >/dev/null 2>&1 || true' EXIT
docker network create "$test_network" >/dev/null
docker run --rm -d --name "$db_container" --network "$test_network" --network-alias db -e POSTGRES_PASSWORD=napl_test_only -e POSTGRES_DB=napl_test -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$db_container" pg_isready -h 127.0.0.1 -U postgres -d napl_test >/dev/null 2>&1; then break; fi
  sleep 1
done
for sql in api/test/bootstrap.sql supabase/fixtures/legacy.sql supabase/migrations/202610130001_gateway.sql supabase/migrations/202610130002_cutover.sql supabase/migrations/202610130003_rbac.sql supabase/migrations/202610140002_auth_state.sql api/test/seed.sql; do
  docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d napl_test < "$sql" >/dev/null
done
docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d napl_test < api/test/integration/rbac.sql >/dev/null
docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d napl_test >/dev/null <<'SQL'
CREATE ROLE gateway_test LOGIN PASSWORD 'napl_test_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;
GRANT gateway_runtime TO gateway_test;
INSERT INTO auth.users(id) VALUES ('fef79a51-49a9-45c9-a2a5-99d7b601e497');
SQL
db_port="$(docker port "$db_container" 5432/tcp | sed 's/.*://')"
api_test_db="postgresql://api_test:napl_test_only@127.0.0.1:${db_port}/napl_test"
auth_test_db="postgresql://gateway_test:napl_test_only@127.0.0.1:${db_port}/napl_test"
export API_TEST_DATABASE_URL="$api_test_db"
export AUTH_TEST_DATABASE_URL="$auth_test_db"
export API_TEST_ADMIN_DATABASE_URL="postgresql://postgres:napl_test_only@127.0.0.1:${db_port}/napl_test"
if [[ "${1:-}" == "--api" ]]; then
  npm test -w @napl/api
else
  npm test
fi
