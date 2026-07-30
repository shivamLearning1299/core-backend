#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding plan catalog..."
npx prisma db seed

echo "Starting application..."
exec node dist/main.js
