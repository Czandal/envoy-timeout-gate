const http = require('http');
const { URL } = require('url');

const port = process.env.PORT || 3000;

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const match = url.pathname.match(/^\/delay\/(\d+)$/);

  if (!match) {
    return json(res, 404, {
      error: 'not_found',
      message: 'Use GET /delay/:delay_ms'
    });
  }

  const delayMs = Number(match[1]);
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 120000) {
    return json(res, 400, {
      error: 'invalid_delay',
      message: 'delay_ms must be an integer between 0 and 120000'
    });
  }

  const startedAt = Date.now();
  const timeoutHeader = req.headers['x-timeout-ms'] || null;
  const envoyUpstreamTimeout = req.headers['x-envoy-upstream-rq-timeout-ms'] || null;
  const envoyExpectedTimeout = req.headers['x-envoy-expected-rq-timeout-ms'] || null;

  console.log('Waiting', { delayMs });

  await new Promise(resolve => setTimeout(resolve, delayMs));

  return json(res, 200, {
    ok: true,
    path: url.pathname,
    delay_ms_requested: delayMs,
    delay_ms_actual: Date.now() - startedAt,
    headers_seen: {
      'x-timeout-ms': timeoutHeader,
      'x-envoy-upstream-rq-timeout-ms': envoyUpstreamTimeout,
      'x-envoy-expected-rq-timeout-ms': envoyExpectedTimeout
    },
    message: `Response returned after ${delayMs} ms delay`
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Delay server listening on ${port}`);
});
