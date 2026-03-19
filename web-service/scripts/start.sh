#!/bin/sh
set -e

echo "Running database migrations..."
node scripts/migrate.mjs

echo "Starting cron scheduler in background..."
node scripts/cron-scheduler.mjs &

echo "Starting server..."
exec node scripts/custom-server.mjs
