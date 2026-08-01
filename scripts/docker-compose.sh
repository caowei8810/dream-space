#!/bin/sh

set -eu

compose_file="infrastructure/docker/compose.yml"

if docker compose version >/dev/null 2>&1; then
  exec docker compose -f "$compose_file" "$@"
fi

if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose -f "$compose_file" "$@"
fi

echo "Docker Compose is required. Install Docker Desktop or the Compose plugin." >&2
exit 1
