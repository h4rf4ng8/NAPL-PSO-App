import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const exec = promisify(execFile);
const hasAction = (statement, action) => [statement.Action].flat().some(pattern =>
  new RegExp(`^${pattern.replaceAll('*', '.*')}$`, 'i').test(action));

export async function smokeDeployment({ functionName, region, functionUrl, publicOrigin }, { invoke = exec, request = fetch } = {}) {
  if (!region || !functionName?.endsWith(':live')) throw new Error('Smoke check requires a live alias and region');
  const url = new URL(functionUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith(`.lambda-url.${region}.on.aws`) || url.username || url.password || url.port) {
    throw new Error('Smoke check requires an AWS Function URL in the deployment region');
  }
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) throw new Error('Smoke check requires the exact HTTPS public origin');
  const inspect = async operation => {
    try {
      const { stdout } = await invoke('aws', ['lambda', operation, '--function-name', functionName.slice(0, -':live'.length),
        '--qualifier', 'live', '--region', region, '--output', 'json', '--no-cli-pager'], { timeout: 20_000, maxBuffer: 1024 * 1024 });
      return JSON.parse(stdout);
    } catch { throw new Error('Could not inspect the deployed Function URL configuration or permissions'); }
  };
  const configuration = await inspect('get-function-url-config');
  if (configuration.AuthType !== 'NONE' || configuration.FunctionUrl !== url.href || configuration.Cors) {
    throw new Error('The live Function URL must match the stack output, use NONE, and leave CORS to Fastify');
  }
  const policyResult = await inspect('get-policy');
  const policy = JSON.parse(policyResult.Policy);
  const publicStatements = policy.Statement.filter(statement => statement.Effect === 'Allow' && [statement.Principal?.AWS ?? statement.Principal].flat().includes('*'));
  if (publicStatements.every(statement => !hasAction(statement, 'lambda:InvokeFunctionUrl') || statement.Condition?.StringEquals?.['lambda:FunctionUrlAuthType'] !== 'NONE')
    || publicStatements.every(statement => !hasAction(statement, 'lambda:InvokeFunction') || String(statement.Condition?.Bool?.['lambda:InvokedViaFunctionUrl']) !== 'true')
    || publicStatements.some(statement => hasAction(statement, 'lambda:InvokeFunction') && String(statement.Condition?.Bool?.['lambda:InvokedViaFunctionUrl']) !== 'true')) {
    throw new Error('Function URL requires both bounded public URL permissions and no unrestricted public invocation');
  }
  const call = (route, options = {}) => request(new URL(route, url), { redirect: 'error', signal: AbortSignal.timeout(10_000), ...options });
  const publicRead = await call('/api/settings/current_season', { headers: { origin: publicOrigin } });
  const publicBody = await publicRead.text();
  if (publicRead.status !== 200 || !publicBody.trim()) throw new Error('Function URL could not read the current season');
  if (publicRead.headers.get('access-control-allow-origin') !== publicOrigin || publicRead.headers.has('access-control-allow-credentials')
    || !publicRead.headers.get('access-control-expose-headers')?.toLowerCase().split(/,\s*/).includes('retry-after')) throw new Error('Public response has incorrect CORS headers');
  const preflight = await call('/api/users/me', { method: 'OPTIONS', headers: {
    origin: publicOrigin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization,content-type,apollo-require-preflight,idempotency-key',
  } });
  const allowedHeaders = preflight.headers.get('access-control-allow-headers')?.toLowerCase().split(/,\s*/) ?? [];
  const allowedMethods = preflight.headers.get('access-control-allow-methods')?.split(/,\s*/) ?? [];
  if (preflight.status !== 204 || preflight.headers.get('access-control-allow-origin') !== publicOrigin
    || preflight.headers.has('access-control-allow-credentials') || !allowedMethods.includes('GET')
    || ['authorization', 'content-type', 'apollo-require-preflight', 'idempotency-key'].some(header => !allowedHeaders.includes(header))) {
    throw new Error('Authorized browser preflight failed');
  }
  const protectedRead = await call('/api/users/me', { headers: { origin: publicOrigin } });
  if (protectedRead.status !== 401 || protectedRead.headers.get('access-control-allow-origin') !== publicOrigin) throw new Error('Protected Function URL read must reject anonymous access with CORS');
  const rejected = await call('/api/users/me', { method: 'OPTIONS', headers: { origin: 'https://untrusted.invalid', 'access-control-request-method': 'GET' } });
  if (rejected.status !== 403 || rejected.headers.has('access-control-allow-origin')) throw new Error('Untrusted browser origin was allowed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { 'function-name': { type: 'string' }, region: { type: 'string' }, url: { type: 'string' }, origin: { type: 'string' } } });
    await smokeDeployment({ functionName: values['function-name'], region: values.region, functionUrl: values.url, publicOrigin: values.origin });
    process.stdout.write('Deployment verified: public database read, protected rejection, CORS, and bounded Function URL permissions.\n');
  } catch {
    process.stderr.write('Deployment smoke check failed. Inspect Lambda status and logs before releasing the frontend.\n');
    process.exitCode = 1;
  }
}
