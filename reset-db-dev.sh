#!/bin/bash

# Reset the database for development (docker-compose.dev.yml)

set -e

echo "Stopping API container..."
docker compose -f docker-compose.dev.yml stop api

echo "Resetting database..."
docker compose -f docker-compose.dev.yml exec -T postgres psql -U teal -d postgres -c "DROP DATABASE IF EXISTS teal_wrapped;"
docker compose -f docker-compose.dev.yml exec -T postgres psql -U teal -d postgres -c "CREATE DATABASE teal_wrapped;"

echo "Starting API container..."
docker compose -f docker-compose.dev.yml start api

echo "Running migrations..."
sleep 2  # Give the container a moment to start
docker compose -f docker-compose.dev.yml exec -T api sqlx migrate run --source api/migrations

echo "Done! Database is ready."
