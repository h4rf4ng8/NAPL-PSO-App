import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const exec = promisify(execFile);

export async function smokeDeployment({ functionName, region, functionUrl, originSecret }, { invoke = exec, request = fetch } = {}) {
  if (!region || !originSecret || !functionName?.endsWith(':live') || originSecret.length < 32) {
    throw new Error('Smoke check requires a live alias, region, Function URL, and ORIGIN_SECRET');
  }
  const url = new URL(functionUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith(`.lambda-url.${region}.on.aws`) || url.username || url.password || url.port) {
    throw new Error('Smoke check requires an AWS Function URL in the deployment region');
  }
  let configuration;
  try {
    const { stdout } = await invoke('aws', [
      'lambda', 'get-function-url-config', '--function-name', functionName.slice(0, -':live'.length),
      '--qualifier', 'live', '--region', region, '--output', 'json', '--no-cli-pager',
    ], { timeout: 20_000, maxBuffer: 1024 * 1024 });
    configuration = JSON.parse(stdout);
  } catch {
    throw new Error('Could not inspect the deployed Function URL configuration');
  }
  if (configuration.AuthType !== 'AWS_IAM' || configuration.FunctionUrl !== url.href) {
    throw new Error('The live Function URL must match the stack output and require AWS IAM');
  }
  const route = '/api/settings/current_season';
  let anonymous;
  try {
    anonymous = await request(new URL(route, url), { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error('Could not check anonymous Function URL access');
  }
  if (anonymous.status !== 403) throw new Error('Function URL did not reject anonymous access with HTTP 403');

  const directory = await mkdtemp(path.join(tmpdir(), 'napl-deploy-smoke-'));
  try {
    const payload = path.join(directory, 'request.json');
    const responsePath = path.join(directory, 'response.json');
    const event = {
      version: '2.0', routeKey: '$default', rawPath: route, rawQueryString: '',
      headers: { 'x-origin-secret': originSecret, 'x-real-ip': '203.0.113.10' },
      requestContext: {
        accountId: 'deployment-smoke', apiId: 'deployment-smoke', domainName: url.hostname,
        http: { method: 'GET', path: route, protocol: 'HTTP/1.1', sourceIp: '203.0.113.10', userAgent: 'deployment-smoke' },
        requestId: randomUUID(), routeKey: '$default', stage: '$default', time: new Date().toUTCString(), timeEpoch: Date.now(),
      },
      isBase64Encoded: false,
    };
    await writeFile(payload, JSON.stringify(event), { mode: 0o600 });
    let metadata;
    let response;
    try {
      const { stdout } = await invoke('aws', [
        'lambda', 'invoke', '--function-name', functionName, '--region', region,
        '--cli-binary-format', 'raw-in-base64-out', '--payload', `file://${payload}`,
        '--cli-connect-timeout', '10', '--cli-read-timeout', '75', '--output', 'json', '--no-cli-pager', responsePath,
      ], { timeout: 90_000, maxBuffer: 1024 * 1024 });
      metadata = JSON.parse(stdout);
      response = JSON.parse(await readFile(responsePath, 'utf8'));
    } catch {
      throw new Error('Could not invoke the deployed Lambda or read its response');
    }
    if (metadata.StatusCode !== 200 || metadata.FunctionError || !/^[1-9]\d*$/.test(metadata.ExecutedVersion ?? '')) {
      throw new Error('Deployed Lambda invocation failed or did not use a published version');
    }
    if (response.statusCode !== 200 || typeof response.body !== 'string' || !response.body.trim()) {
      throw new Error('Deployed Lambda could not read the current season from the application database');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { 'function-name': { type: 'string' }, region: { type: 'string' }, url: { type: 'string' } } });
    await smokeDeployment({ functionName: values['function-name'], region: values.region, functionUrl: values.url, originSecret: process.env.ORIGIN_SECRET });
    process.stdout.write('Deployment verified: live Lambda reads the application database; anonymous Function URL access is denied.\n');
  } catch {
    // CLI errors and response bodies can contain runtime secrets; keep failure output fixed.
    process.stderr.write('Deployment smoke check failed. Inspect Lambda status and logs before releasing the frontend.\n');
    process.exitCode = 1;
  }
}
