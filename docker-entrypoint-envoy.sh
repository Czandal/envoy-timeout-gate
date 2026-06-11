#!/bin/sh
set -eu

GLOBAL_QPS_LIMIT="${GLOBAL_QPS_LIMIT:-10}"
GLOBAL_QPS_BURST="${GLOBAL_QPS_BURST:-$GLOBAL_QPS_LIMIT}"
EXCHANGE_UPSTREAM_HOST="${EXCHANGE_UPSTREAM_HOST:-exchange.staging.adtonos.com}"
EXCHANGE_UPSTREAM_PORT="${EXCHANGE_UPSTREAM_PORT:-443}"

if ! echo "$GLOBAL_QPS_LIMIT" | grep -Eq '^[0-9]+$'; then
  echo "GLOBAL_QPS_LIMIT must be a positive integer, got: $GLOBAL_QPS_LIMIT" >&2
  exit 1
fi

if ! echo "$GLOBAL_QPS_BURST" | grep -Eq '^[0-9]+$'; then
  echo "GLOBAL_QPS_BURST must be a positive integer, got: $GLOBAL_QPS_BURST" >&2
  exit 1
fi

if [ "$GLOBAL_QPS_LIMIT" -lt 1 ] || [ "$GLOBAL_QPS_BURST" -lt 1 ]; then
  echo "GLOBAL_QPS_LIMIT and GLOBAL_QPS_BURST must be >= 1" >&2
  exit 1
fi

if ! echo "$EXCHANGE_UPSTREAM_PORT" | grep -Eq '^[0-9]+$'; then
  echo "EXCHANGE_UPSTREAM_PORT must be a positive integer, got: $EXCHANGE_UPSTREAM_PORT" >&2
  exit 1
fi

if [ "$EXCHANGE_UPSTREAM_PORT" -lt 1 ] || [ "$EXCHANGE_UPSTREAM_PORT" -gt 65535 ]; then
  echo "EXCHANGE_UPSTREAM_PORT must be between 1 and 65535" >&2
  exit 1
fi

sed \
  -e "s/__GLOBAL_QPS_LIMIT__/${GLOBAL_QPS_LIMIT}/g" \
  -e "s/__GLOBAL_QPS_BURST__/${GLOBAL_QPS_BURST}/g" \
  -e "s/__EXCHANGE_UPSTREAM_HOST__/${EXCHANGE_UPSTREAM_HOST}/g" \
  -e "s/__EXCHANGE_UPSTREAM_PORT__/${EXCHANGE_UPSTREAM_PORT}/g" \
  /etc/envoy/envoy.yaml.template > /tmp/envoy.yaml

exec envoy -c /tmp/envoy.yaml -l info
