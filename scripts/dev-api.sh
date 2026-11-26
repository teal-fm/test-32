#!/usr/bin/env bash
# Run the year-in-music API locally for `pnpm dev`.
# Postgres comes from docker-compose.dev.yml; the API runs natively (faster than the dev container).
# Override the host port with WRAPPED_DB_PORT if 5433 is taken.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_PORT="${WRAPPED_DB_PORT:-5433}"
POSTGRES_PORT="$DB_PORT" docker compose -f docker-compose.dev.yml up -d --wait postgres

# run from the repo root so ./images resolves for artist images
export DATABASE_URL="postgres://teal:teal@localhost:${DB_PORT}/teal_wrapped"
export SQLX_OFFLINE=true
export RUST_LOG="${RUST_LOG:-info}"
exec cargo run --bin teal-wrapped-api
