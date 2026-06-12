#!/bin/sh
set -eu

GLOBAL_QPS_LIMIT="${PROXY_QPS:-10}"
GLOBAL_QPS_BURST="${GLOBAL_QPS_BURST:-$GLOBAL_QPS_LIMIT}"

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

sed \
  -e "s/__GLOBAL_QPS_LIMIT__/${GLOBAL_QPS_LIMIT}/g" \
  -e "s/__GLOBAL_QPS_BURST__/${GLOBAL_QPS_BURST}/g" \
  /etc/envoy/envoy.yaml.template > /tmp/envoy.yaml

exec envoy -c /tmp/envoy.yaml -l info
