# Envoy dynamic timeout demo

This demo shows how Envoy can read `x-timeout-ms` in a Lua filter, map it to `x-envoy-upstream-rq-timeout-ms`, and enforce a per-request upstream timeout.

## Files

- `envoy.yaml` — Envoy listener, Lua filter, route, cluster
- `server.js` — custom Node.js delay server with `GET /delay/:delay_ms`
- `Dockerfile.server` — image for the delay server
- `docker-compose.yml` — starts Envoy and the delay server

## Start

```bash
docker compose up --build
```

Envoy listens on `http://localhost:10000` and admin is on `http://localhost:9901`.
The delay server is also exposed directly on `http://localhost:3000` for comparison.

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

## Expected behavior

- When `x-timeout-ms` is valid, Envoy copies it to `x-envoy-upstream-rq-timeout-ms`.
- If the upstream does not complete within that deadline, Envoy returns a timeout response to the client.
- The upstream app receives `x-envoy-expected-rq-timeout-ms`, which helps confirm the deadline propagation.
- Invalid timeout values are rejected before proxying to upstream.

## Notes

- Route timeout is set to `15s` as a fallback when `x-timeout-ms` is absent.
- Retries are disabled so the timeout behaves like a hard outer deadline.
- Cluster `connect_timeout` remains static at `2s`; this demo changes request timeout, not per-request TCP connect timeout.
