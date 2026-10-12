#!/bin/sh
set -e

cd /app/migrate
./node_modules/.bin/prisma migrate deploy

cd /app
exec "$@"
