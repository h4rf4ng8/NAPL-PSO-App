import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const percentile = (values, p) => values.length > 0 ? Math.round(values.toSorted((a, b) => a - b)[Math.ceil(values.length * p) - 1]) : null;
const rate = (count, total) => total ? Number((count / total).toFixed(4)) : null;

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Bounded staging burst check (no retries; max 1,850 requests).\n\n` +
      `Set LOAD_STAGE=staging, LOAD_BASE_URL=https://<isolated-staging-project-host>, LOAD_DB_CONNECTION_BUDGET=<integer>, and LOAD_ACCESS_TOKEN=<authenticated access token>.\n` +
      `Optional: LOAD_ROUNDS=1..5 (default 1), LOAD_TIMEOUT_MS=1000..60000 (default 35000),\n` +
      `LOAD_LAMBDA_RESERVED_CONCURRENCY=<integer>,\n` +
      `LOAD_MEASUREMENTS_FILE=<JSON>, LOAD_REPORT=<path>.\n` +
      `Runs sequential bursts at 20, 50, 100 and 200 simultaneous requests.`);
    return;
  }
  const levels = [20, 50, 100, 200];
  const base = process.env.LOAD_BASE_URL;
  const target = base && new URL(base);
  const host = target?.hostname;
  if (!target || process.env.LOAD_STAGE !== 'staging' || target.protocol !== 'https:' ||
      !(host.includes('staging') || /^[a-z0-9]+\.lambda-url\.[a-z]{2}(?:-[a-z]+)+-\d\.on\.aws$/.test(host))) {
    throw new Error('Refusing load traffic: set LOAD_STAGE=staging and LOAD_BASE_URL to an HTTPS isolated-staging API URL.');
  }
  const budget = Number(process.env.LOAD_DB_CONNECTION_BUDGET);
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error('Set LOAD_DB_CONNECTION_BUDGET to the available staging database connection budget.');
  const reservedConcurrency = process.env.LOAD_LAMBDA_RESERVED_CONCURRENCY === undefined
    ? null : Number(process.env.LOAD_LAMBDA_RESERVED_CONCURRENCY);
  if (reservedConcurrency !== null && (!Number.isSafeInteger(reservedConcurrency) || reservedConcurrency < 1)) {
    throw new Error('LOAD_LAMBDA_RESERVED_CONCURRENCY must be a positive integer when supplied.');
  }
  const rounds = Number(process.env.LOAD_ROUNDS ?? 1);
  assert.ok(Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 5, 'LOAD_ROUNDS must be an integer from 1 to 5');
  const timeoutMs = Number(process.env.LOAD_TIMEOUT_MS ?? 35_000);
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60_000, 'LOAD_TIMEOUT_MS must be from 1000 to 60000');
  const accessToken = process.env.LOAD_ACCESS_TOKEN;
  if (!accessToken) throw new Error('LOAD_ACCESS_TOKEN must contain an authenticated staging access token.');
  const reports = [];

  async function request() {
    const started = performance.now();
    try {
      const response = await fetch(new URL('/api/standings', base), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          'apollo-require-preflight': 'true',
        },
        body: JSON.stringify({ variables: {} }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
        // Non-JSON responses still contribute their HTTP status.
      }
      const elapsedMs = performance.now() - started;
      // An AWS request id
      // proves an AWS boundary response, but does not prove that Lambda ran.
      const responseSource = response.headers.has('x-amzn-requestid') ? 'awsBoundary' : 'unknown';
      if (response.status === 429) {
        const appLimited = body?.error?.code === 'rate_limited';
        return {
          kind: appLimited ? 'application429' : 'unknown429', responseSource,
          elapsedMs, status: response.status,
        };
      }
      return !response.ok || body?.errors?.length || !body?.data
        ? { kind: 'failed', responseSource, elapsedMs, status: response.status }
        : { kind: 'success', responseSource, elapsedMs };
    } catch (error) {
      return {
        kind: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'incomplete',
        responseSource: 'unknown', elapsedMs: performance.now() - started,
      };
    }
  }

  async function runBurst(concurrency) {
    const start = Promise.withResolvers();
    const workers = Array.from({ length: concurrency }, async () => {
      await start.promise;
      return request();
    });
    start.resolve();
    const outcomes = await Promise.all(workers);
    const total = outcomes.length;
    const successes = outcomes.filter(item => item.kind === 'success');
    const application429 = outcomes.filter(item => item.kind === 'application429').length;
    const unknown429 = outcomes.filter(item => item.kind === 'unknown429').length;
    const failed = outcomes.filter(item => item.kind === 'failed').length;
    const timedOut = outcomes.filter(item => item.kind === 'timeout').length;
    const incomplete = outcomes.filter(item => item.kind === 'incomplete').length;
    const statusCounts = Object.fromEntries([...new Set(outcomes.map(item => item.status).filter(Boolean))]
      .map(status => [status, outcomes.filter(item => item.status === status).length]));
    return {
      concurrency, attempts: total, successes: successes.length, successRate: rate(successes.length, total),
      successfulLatencyMs: Object.fromEntries([0.5, 0.95, 0.99].map(p => [`p${Math.round(p * 100)}`, percentile(successes.map(item => item.elapsedMs), p)])),
      application429, applicationRejectionRate: rate(application429, total), unknown429, unknown429RejectionRate: rate(unknown429, total),
      rejectionRate: rate(application429 + unknown429, total), failureRate: rate(failed, total),
      incompleteRate: rate(incomplete, total), timeoutRate: rate(timedOut, total),
      responseSources: Object.fromEntries(['awsBoundary', 'unknown'].map(source => [source, outcomes.filter(item => item.responseSource === source).length])),
      failed, incomplete, timedOut, statusCounts,
      successfulLatencies: successes.map(item => item.elapsedMs),
    };
  }

  for (const concurrency of levels) {
    const bursts = [];
    for (let round = 0; round < rounds; round++) bursts.push(await runBurst(concurrency));
    const latencies = bursts.flatMap(item => item.successfulLatencies);
    const total = bursts.reduce((sum, item) => sum + item.attempts, 0);
    const successesCount = bursts.reduce((sum, item) => sum + item.successes, 0);
    const application429 = bursts.reduce((sum, item) => sum + item.application429, 0);
    const statusCounts = {};
    for (const item of bursts) {
      for (const [status, count] of Object.entries(item.statusCounts)) statusCounts[status] = (statusCounts[status] ?? 0) + count;
    }
    const result = {
      concurrency, rounds, attempts: total, successes: successesCount, successRate: rate(successesCount, total),
      successfulLatencyMs: Object.fromEntries([0.5, 0.95, 0.99].map(p => [`p${Math.round(p * 100)}`, percentile(latencies, p)])),
      application429, applicationRejectionRate: rate(application429, total),
      unknown429: bursts.reduce((sum, item) => sum + item.unknown429, 0),
      unknown429RejectionRate: rate(bursts.reduce((sum, item) => sum + item.unknown429, 0), total),
      rejectionRate: rate(application429 + bursts.reduce((sum, item) => sum + item.unknown429, 0), total),
      responseSources: Object.fromEntries(['awsBoundary', 'unknown'].map(source => [source, bursts.reduce((sum, item) => sum + item.responseSources[source], 0)])),
      failed: bursts.reduce((sum, item) => sum + item.failed, 0),
      failureRate: rate(bursts.reduce((sum, item) => sum + item.failed, 0), total),
      incomplete: bursts.reduce((sum, item) => sum + item.incomplete, 0),
      incompleteRate: rate(bursts.reduce((sum, item) => sum + item.incomplete, 0), total),
      timedOut: bursts.reduce((sum, item) => sum + item.timedOut, 0),
      timeoutRate: rate(bursts.reduce((sum, item) => sum + item.timedOut, 0), total),
      statusCounts,
      bursts: bursts.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'successfulLatencies'))),
    };
    reports.push(result);
    console.log(JSON.stringify(result));
  }

  const measurements = process.env.LOAD_MEASUREMENTS_FILE
    ? JSON.parse(await readFile(process.env.LOAD_MEASUREMENTS_FILE, 'utf8')) : null;
  const report = {
    target: { hostname: host, stage: 'staging' },
    inputs: { concurrency: levels, rounds, requestTimeoutMs: timeoutMs, databaseConnectionBudget: budget, lambdaReservedConcurrency: reservedConcurrency ?? 'unknown', operation: 'Standings query; read-only', accessTokenProvided: Boolean(accessToken) },
    observations: {
      databaseConnections: measurements?.databaseConnections ?? 'unknown',
      databaseFailures: measurements?.databaseFailures ?? 'unknown',
      firewallRejections: measurements?.firewallRejections ?? 'unknown',
      lambdaThrottles: measurements?.lambdaThrottles ?? 'unknown',
    },
    results: reports,
    note: 'Client latency covers the browser-facing request to the API, including response-body parsing. An AWS request-id indicates an AWS boundary response only; it does not prove Lambda execution. Other responses are source unknown. Collect database and Lambda throttle metrics separately; missing observations remain unknown.',
  };
  const out = process.env.LOAD_REPORT ?? `/tmp/napl-staging-load-${Date.now()}.json`;
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(`Report: ${out}`);
}

await main();
