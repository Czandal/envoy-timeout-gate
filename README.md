# Envoy dynamic timeout + global QPS limit demo

This demo shows how Envoy can:

- read `x-timeout-ms` in a Lua filter, map it to `x-envoy-upstream-rq-timeout-ms`, and enforce a per-request upstream timeout
- enforce a global QPS limit for all proxied requests; over-limit clients get `429 Too Many Requests`
- route requests with an `exchange` header to `exchange.staging.adtonos.com/_data`; all others go to the local server

## Files

- `envoy.yaml.template` — Envoy listener, Lua filter (timeout), local rate limit filter, route, cluster
- `docker-entrypoint-envoy.sh` — validates env and renders the Envoy config at startup
- `.env` — `GLOBAL_QPS_LIMIT`, optional `GLOBAL_QPS_BURST`, and exchange upstream settings
- `server.js` — custom Node.js delay server with `GET /delay/:delay_ms`
- `Dockerfile.server` — image for the delay server
- `docker-compose.yml` — starts Envoy and the delay server
- `k6/qps-limit-test.js` — load test proving QPS limiting (~50% rejected at 2× limit)

## Start

```bash
docker compose up --build
```

Envoy listens on `http://localhost:10000` and admin is on `http://localhost:9901`.
The delay server is also exposed directly on `http://localhost:3000` for comparison.

### QPS limit configuration

Set the global limit in `.env` (see `.env.example`):

```bash
GLOBAL_QPS_LIMIT=10
GLOBAL_QPS_BURST=10
```

- `GLOBAL_QPS_LIMIT` — sustained requests per second (token bucket refill rate)
- `GLOBAL_QPS_BURST` — maximum burst size (`max_tokens`); defaults to `GLOBAL_QPS_LIMIT` when unset

On startup, `docker-entrypoint-envoy.sh` validates these values and renders `envoy.yaml.template`.

QPS limiting uses Envoy's native `envoy.filters.http.local_ratelimit` filter with a process-wide token bucket (`local_rate_limit_per_downstream_connection: false`), so it works across all Envoy worker threads without forcing `--concurrency 1`.

Over-limit requests are rejected before upstream proxying with `429 Too Many Requests` (and optional `x-ratelimit-*` headers).

### Header-based routing

If the request includes an `exchange` header (any value), Envoy proxies it to `EXCHANGE_UPSTREAM_HOST/_data` over HTTPS. The header is stripped before forwarding. All other requests go to the local delay server.

| `exchange` header | Upstream |
|-------------------|----------|
| present | `exchange.staging.adtonos.com/_data` (configurable via `.env`) |
| absent | local delay server (`:3000`) |

Example — local delay server (default):

```bash
curl -i http://localhost:10000/delay/100
```

Example — exchange staging (`/_data` on upstream, regardless of client path):

```bash
curl -i -H 'exchange: 1' http://localhost:10000/anything
```

Configure the exchange host/port in `.env`:

```bash
EXCHANGE_UPSTREAM_HOST=exchange.staging.adtonos.com
EXCHANGE_UPSTREAM_PORT=443
```

## Test

Successful call through Envoy:

```bash
curl -i -H 'x-timeout-ms: 2000' http://localhost:10000/delay/500
```

Expected timeout through Envoy:

```bash
curl -i -H 'x-timeout-ms: 1234' http://localhost:10000/delay/3000
```

Direct call to upstream, no Envoy enforcement:

```bash
curl -i http://localhost:3000/delay/3000
```

Invalid header rejected by Lua:

```bash
curl -i -H 'x-timeout-ms: abc' http://localhost:10000/delay/100
```

Quota exceeded (default limit is 10 QPS from `.env`):

```bash
# send a quick burst; some requests should return 429
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:10000/delay/0; done
```

### k6 QPS limit test

With `GLOBAL_QPS_LIMIT=10` in `.env`, run k6 at 20 QPS. About half the requests should be rejected:

```bash
k6 run k6/qps-limit-test.js
```

The script prints a summary with accepted vs quota-rejected counts.

## Expected behavior

- When `x-timeout-ms` is valid, Envoy copies it to `x-envoy-upstream-rq-timeout-ms`.
- If the upstream does not complete within that deadline, Envoy returns a timeout response to the client.
- The upstream app receives `x-envoy-expected-rq-timeout-ms`, which helps confirm the deadline propagation.
- Invalid timeout values are rejected before proxying to upstream.
- All requests through Envoy share one global QPS token bucket (`GLOBAL_QPS_LIMIT` / `GLOBAL_QPS_BURST` in `.env`).
- When the bucket is empty, Envoy returns `429` without calling upstream.
- Rate-limit stats are emitted under the `global_qps_limiter.http_local_rate_limit.*` namespace on the admin port.
- Requests with an `exchange` header are rewritten to `/_data` on the configured HTTPS exchange host; all other requests use the local delay server.

## Notes

- Route timeout is set to `15s` as a fallback when `x-timeout-ms` is absent.
- Retries are disabled so the timeout behaves like a hard outer deadline.
- Cluster `connect_timeout` remains static at `2s`; this demo changes request timeout, not per-request TCP connect timeout.
- QPS enforcement is handled by `envoy.filters.http.local_ratelimit`; Lua is only used for timeout validation.
- For multi-instance deployments, each Envoy process enforces its own local limit. Use a global rate-limit service (`envoy.filters.http.ratelimit` + RLS) if you need a cluster-wide cap.
