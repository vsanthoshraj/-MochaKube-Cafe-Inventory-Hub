#!/bin/sh

set -e

if [ -z "$BACKEND_URL" ]; then
    echo "ERROR: BACKEND_URL environment variable is not set."
    exit 1
fi

echo "Backend URL:"
echo "$BACKEND_URL"

envsubst '${BACKEND_URL}' \
    < /etc/nginx/templates/nginx.conf.template \
    > /etc/nginx/conf.d/default.conf

echo "========== Generated nginx.conf =========="
cat /etc/nginx/conf.d/default.conf
echo "=========================================="

exec nginx -g "daemon off;"