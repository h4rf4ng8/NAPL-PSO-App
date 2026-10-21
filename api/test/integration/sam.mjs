import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const network = process.env.SAM_TEST_NETWORK;
assert.match(network ?? '', /^napl-check-\d+$/, 'Run through pnpm run test:sam to create disposable services');
const memoryMiB = 128;
const scratch = await mkdtemp(path.join(tmpdir(), 'napl-sam-'));
const envFile = path.join(scratch, 'env.json');
const origin = 'http://localhost:5173';
const environment = {
  NODE_ENV: 'test', PUBLIC_ORIGIN: origin,
  DATABASE_URL: 'postgresql://api_test:napl_test_only@db:5432/napl_test',
  SUPABASE_URL: 'https://supabase.invalid', SUPABASE_PUBLISHABLE_KEY: 'sam-test-only',
  SUPABASE_SECRET_KEY: 'sam-test-only',
  SUPABASE_JWKS_URL: 'https://supabase.invalid/auth/v1/.well-known/jwks.json',
  DISCORD_TRANSFER_WEBHOOK: '',
};
// Explicit dummy AWS credentials prevent accidental use of the developer's profile.
const cliEnv = { ...process.env, AWS_ACCESS_KEY_ID: 'testing', AWS_SECRET_ACCESS_KEY: 'testing', AWS_SESSION_TOKEN: '',
  AWS_EC2_METADATA_DISABLED: 'true', AWS_CONFIG_FILE: path.join(scratch, 'aws-config'),
  AWS_SHARED_CREDENTIALS_FILE: path.join(scratch, 'aws-credentials'), SAM_CLI_TELEMETRY: '0' };
const results = [];

function event(url, options = {}) {
  const parsed = new URL(url, origin);
  return {
    version: '2.0', routeKey: '$default', rawPath: parsed.pathname, rawQueryString: parsed.search.slice(1),
    headers: { origin, ...options.headers },
    cookies: options.cookies ?? [],
    requestContext: {
      accountId: '123456789012', apiId: 'sam-test', domainName: 'sam-test.lambda-url.us-east-1.on.aws', domainPrefix: 'sam-test',
      http: { method: options.method ?? 'GET', path: parsed.pathname, protocol: 'HTTP/1.1', sourceIp: '192.0.2.2', userAgent: 'sam-test' },
      requestId: randomUUID(), routeKey: '$default', stage: '$default', time: new Date().toUTCString(), timeEpoch: Date.now(),
    },
    ...(options.body !== undefined && { body: options.base64 ? Buffer.from(JSON.stringify(options.body)).toString('base64') : JSON.stringify(options.body) }),
    isBase64Encoded: options.base64 ?? false,
  };
}

async function invoke(name, request, expectedStatus, env = environment) {
  await writeFile(envFile, JSON.stringify({ ApiFunction: env }), { mode: 0o600 });
  const eventFile = path.join(scratch, 'event.json');
  await writeFile(eventFile, JSON.stringify(request), { mode: 0o600 });
  const runtimeLog = path.join(scratch, 'runtime.log');
  const args = ['local', 'invoke', 'ApiFunction', '--template-file', path.join(root, 'api/template.yaml'),
    '--event', eventFile, '--env-vars', envFile, '--docker-network', network,
    '--parameter-overrides', `FunctionMemorySize=${memoryMiB}`,
    '--region', 'us-east-1', '--log-file', runtimeLog, '--skip-pull-image'];
  const started = performance.now();
  let stderr = '';
  let response;
  try {
    ({ stderr } = await exec('sam', args, { cwd: root, env: cliEnv, timeout: 300_000, maxBuffer: 4 * 1024 * 1024 }));
    // SAM mixes the response with runtime logs, including occasional teardown messages.
    const log = await readFile(runtimeLog, 'utf8');
    const responseLine = log.split('\n').findLast(line => line.startsWith('{"statusCode":'));
    assert.ok(responseLine, 'SAM did not return an HTTP response');
    response = JSON.parse(responseLine);
    assert.match(log, new RegExp(`Memory Size: ${memoryMiB} MB`));
  } catch (error) {
    let log = '';
    try { log = await readFile(runtimeLog, 'utf8'); } catch (logError) { if (logError.code !== 'ENOENT') throw logError; }
    const details = `${error.stderr ?? stderr}\n${log}`;
    throw new Error(`SAM invocation ${name} failed:\n${details.slice(-8000)}`, { cause: error });
  }
  assert.equal(response.statusCode, expectedStatus, `${name}: ${response.body ?? response.errorType}`);
  assert.equal(response.headers['cache-control'], 'no-store');
  results.push({ name, status: response.statusCode, localWallMs: Math.round(performance.now() - started) });
  console.log(`PASS ${name}: HTTP ${response.statusCode}`);
  return response;
}

try {
  await writeFile(cliEnv.AWS_CONFIG_FILE, '');
  await writeFile(cliEnv.AWS_SHARED_CREDENTIALS_FILE, '');
  const accounts = await invoke('public read through Prisma', event('/api/accounts'), 200);
  const accountPage = JSON.parse(accounts.body);
  const rows = accountPage.nodes;
  assert.ok(Array.isArray(rows));
  assert.ok(Buffer.byteLength(accounts.body, 'utf8') <= 10_000);
  assert.equal(typeof accountPage.pageInfo.hasNextPage, 'boolean');
  assert.ok(rows.some(row => row.id === '11111111-1111-4111-8111-111111111111'));
  assert.ok(rows.every(row => !Object.hasOwn(row, 'email')));
  await invoke('protected route rejects forged identity headers', event('/api/users/me', { headers: { authorization: 'Bearer forged', 'x-user-role': 'super_admin' } }), 401);
  await invoke('mutation requires bearer', event('/api/teams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: {} }), 401);
  const auth = { origin, 'content-type': 'application/json', 'apollo-require-preflight': 'true' };
  const overview = await invoke('base64 GraphQL preserves public overview without private account data', event('/api/league-overview', {
    method: 'POST', headers: auth, base64: true, body: { variables: {} },
  }), 200);
  const payload = JSON.parse(overview.body);
  assert.equal(payload.errors, undefined);
  assert.equal(payload.data.leagueOverview.me, null);
  assert.ok(Number.isSafeInteger(payload.data.leagueOverview.playerCount));
  assert.ok(Number.isSafeInteger(payload.data.leagueOverview.activeTeamCount));
  assert.ok(Array.isArray(payload.data.leagueOverview.tickerNews));
  assert.ok(Buffer.byteLength(overview.body, 'utf8') <= 10_000);
  assert.equal(overview.cookies, undefined);
  const protectedRead = await invoke('base64 protected GraphQL requires bearer', event('/api/team-standings', {
    method: 'POST', headers: auth, base64: true, body: { variables: {} },
  }), 401);
  const denied = JSON.parse(protectedRead.body);
  assert.deepEqual(denied, { error: 'authentication_required', message: 'authentication_required' });

  const offline = { ...environment, DATABASE_URL: 'postgresql://api_test:napl_test_only@db:1/napl_test' };
  await invoke('missing bearer fails closed before database access', event('/api/users/me'), 401, offline);
  const dbUnavailable = await invoke('database failure returns controlled 503', event('/api/accounts'), 503, offline);
  assert.equal(JSON.parse(dbUnavailable.body).error, 'service_unavailable');

  const report = { runtime: 'nodejs24.x', architecture: 'arm64', memoryMiB,
    command: 'sam local invoke ApiFunction', results,
    limits: 'One invocation per runtime container; local wall time includes SAM/Docker startup. No AWS/Vercel deployment, live OAuth, production TLS, reserved-concurrency or capacity validation.' };
  await writeFile(path.join(root, 'api/dist/sam-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${results.length} SAM runtime checks passed. Report: api/dist/sam-report.json`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
