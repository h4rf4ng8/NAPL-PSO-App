#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

exec docker compose --env-file api/.env up --build "$@"
