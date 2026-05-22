#!/bin/sh
set -eu

echo "Running Alembic migrations..."
alembic -c alembic.ini upgrade head

echo "Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
