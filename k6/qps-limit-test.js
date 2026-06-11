import http from 'k6/http';
import { Counter } from 'k6/metrics';

const quotaRejected = new Counter('quota_rejected');
const upstreamOk = new Counter('upstream_ok');
const unexpected = new Counter('unexpected_responses');

// Demo: Envoy is configured for 10 QPS (see .env). This test sends 20 QPS.
const TARGET_QPS = 20;
const DEMO_ENVOY_QPS = 10;
const TEST_DURATION = '10s';

export const options = {
  scenarios: {
    over_limit_load: {
      executor: 'constant-arrival-rate',
      rate: TARGET_QPS,
      timeUnit: '1s',
      duration: TEST_DURATION,
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    quota_rejected: [`count>=${TARGET_QPS * 10 * 0.4}`],
    upstream_ok: [`count>=${TARGET_QPS * 10 * 0.4}`],
    unexpected_responses: ['count==0'],
  },
};

export default function () {
  const res = http.get('http://localhost:10000/delay/0');

  if (res.status === 429) {
    quotaRejected.add(1);
    return;
  }

  if (res.status === 200) {
    upstreamOk.add(1);
    return;
  }

  unexpected.add(1);
}

export function handleSummary(data) {
  const rejected = data.metrics.quota_rejected?.values?.count ?? 0;
  const ok = data.metrics.upstream_ok?.values?.count ?? 0;
  const other = data.metrics.unexpected_responses?.values?.count ?? 0;
  const total = rejected + ok + other;
  const rejectedPct = total > 0 ? ((rejected / total) * 100).toFixed(1) : '0.0';
  const okPct = total > 0 ? ((ok / total) * 100).toFixed(1) : '0.0';

  const lines = [
    '',
    'QPS limit demo summary',
    '----------------------',
    `Envoy global QPS limit (demo): ${DEMO_ENVOY_QPS}`,
    `k6 arrival rate:               ${TARGET_QPS} req/s for ${TEST_DURATION}`,
    `Total requests:                ${total}`,
    `Quota rejected (429):          ${rejected} (${rejectedPct}%)`,
    `Upstream OK (200):             ${ok} (${okPct}%)`,
    `Unexpected:                    ${other}`,
    '',
    `Expected: ~50% rejected when sending ${TARGET_QPS} QPS against a ${DEMO_ENVOY_QPS} QPS limit.`,
    '',
  ];

  return { stdout: lines.join('\n') };
}
