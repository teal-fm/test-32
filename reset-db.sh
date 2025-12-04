#!/bin/bash

# Reset the database by dropping and recreating it

set -e

echo "Resetting database..."

docker-compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS teal_wrapped;"
docker-compose exec -T postgres psql -U postgres -c "CREATE DATABASE teal_wrapped;"

echo "Database reset. Running migrations..."

cd api
cargo sqlx migrate run
cd ..

echo "Done! Database is ready."
