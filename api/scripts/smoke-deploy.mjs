import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const exec = promisify(execFile);
const hasAction = (statement, action) => [statement.Action].flat().some(pattern =>
  new RegExp(`^${pattern.replaceAll('*', '.*')}$`, 'i').test(action));

export async function smokeDeployment({ functionName, region, functionUrl, publicOrigin, distributionId = '', domainName = '' }, { invoke = exec, request = fetch } = {}) {
  if (!region || !functionName?.endsWith(':live')) throw new Error('Smoke check requires a live alias and region');
  const url = new URL(functionUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith(`.lambda-url.${region}.on.aws`) || url.username || url.password || url.port) {
    throw new Error('Smoke check requires an AWS Function URL in the deployment region');
  }
  const edge = Boolean(distributionId);
  if (edge !== Boolean(domainName) || (edge && (!/^[A-Z0-9]+$/.test(distributionId) || !/^[a-z0-9]+\.cloudfront\.net$/.test(domainName)))) throw new Error('Invalid CloudFront deployment identity');
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
  if (configuration.AuthType !== (edge ? 'AWS_IAM' : 'NONE') || configuration.FunctionUrl !== url.href || configuration.Cors) {
    throw new Error('The live Function URL must match the stack output, use the expected auth type, and leave CORS to Fastify');
  }
  const policyResult = await inspect('get-policy');
  const policy = JSON.parse(policyResult.Policy);
  const publicStatements = policy.Statement.filter(statement => statement.Effect === 'Allow' && [statement.Principal?.AWS ?? statement.Principal].flat().includes('*'));
  if (edge) {
    const grants = policy.Statement.filter(statement => statement.Effect === 'Allow');
    if (grants.some(statement => statement.Principal?.Service !== 'cloudfront.amazonaws.com'
      || !new RegExp(`^arn:aws:cloudfront::[0-9]{12}:distribution/${distributionId}$`).test(statement.Condition?.ArnLike?.['AWS:SourceArn'] ?? statement.Condition?.ArnEquals?.['AWS:SourceArn'] ?? ''))
      || grants.every(statement => !(hasAction(statement, 'lambda:InvokeFunctionUrl') && statement.Condition?.StringEquals?.['lambda:FunctionUrlAuthType'] === 'AWS_IAM'))
      || grants.every(statement => !(hasAction(statement, 'lambda:InvokeFunction') && String(statement.Condition?.Bool?.['lambda:InvokedViaFunctionUrl']) === 'true'))) {
      throw new Error('CloudFront requires exact distribution-only Function URL permissions');
    }
    const read = async (service, operation, args) => {
      const { stdout } = await invoke('aws', [service, operation, ...args, '--output', 'json', '--no-cli-pager'], { timeout: 20_000, maxBuffer: 1024 * 1024 });
      return JSON.parse(stdout);
    };
    const { Distribution: distribution } = await read('cloudfront', 'get-distribution', ['--id', distributionId]);
    const behavior = distribution.DistributionConfig.DefaultCacheBehavior;
    const target = distribution.DistributionConfig.Origins.Items.find(item => item.Id === behavior.TargetOriginId);
    if (!distribution.DistributionConfig.Enabled || distribution.DomainName !== domainName || target?.DomainName !== url.hostname
      || behavior.CachePolicyId !== '4135ea2d-6df8-44a3-9df3-4b5a84be39ad' || !target.OriginAccessControlId
      || !behavior.FunctionAssociations?.Items?.some(item => item.EventType === 'viewer-request' && /^arn:aws:cloudfront::[0-9]{12}:function\/napl-api-edge$/.test(item.FunctionARN))
      || target.CustomOriginConfig?.OriginProtocolPolicy !== 'https-only') throw new Error('CloudFront must use the live origin, disabled caching, HTTPS and OAC');
    const { OriginAccessControl: oac } = await read('cloudfront', 'get-origin-access-control', ['--id', target.OriginAccessControlId]);
    if (oac.OriginAccessControlConfig.OriginAccessControlOriginType !== 'lambda'
      || oac.OriginAccessControlConfig.SigningBehavior !== 'always' || oac.OriginAccessControlConfig.SigningProtocol !== 'sigv4') throw new Error('CloudFront must always sign Lambda origin requests');
    const acl = distribution.DistributionConfig.WebACLId?.match(/^arn:aws:wafv2:us-east-1:[0-9]{12}:global\/webacl\/([^/]+)\/([^/]+)$/);
    if (!acl) throw new Error('CloudFront requires a global WAF ACL');
    const { WebACL: webAcl } = await read('wafv2', 'get-web-acl', ['--region', 'us-east-1', '--scope', 'CLOUDFRONT', '--name', acl[1], '--id', acl[2]]);
    if (webAcl.Rules.every(rule => !(rule.Action?.Block && rule.Statement?.RateBasedStatement?.AggregateKeyType === 'IP'))) throw new Error('CloudFront requires an IP rate block rule');
    const direct = await request(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (direct.status !== 403) throw new Error('Direct Function URL must reject unsigned access');
  } else if (publicStatements.every(statement => !hasAction(statement, 'lambda:InvokeFunctionUrl') || statement.Condition?.StringEquals?.['lambda:FunctionUrlAuthType'] !== 'NONE')
    || publicStatements.every(statement => !hasAction(statement, 'lambda:InvokeFunction') || String(statement.Condition?.Bool?.['lambda:InvokedViaFunctionUrl']) !== 'true')
    || publicStatements.some(statement => hasAction(statement, 'lambda:InvokeFunction') && String(statement.Condition?.Bool?.['lambda:InvokedViaFunctionUrl']) !== 'true')) {
    throw new Error('Function URL requires both bounded public URL permissions and no unrestricted public invocation');
  }
  const call = (route, options = {}) => request(new URL(route, edge ? `https://${domainName}` : url), { redirect: 'error', signal: AbortSignal.timeout(10_000), ...options });
  const publicRead = await call('/api/settings/current_season', { headers: { origin: publicOrigin } });
  const publicBody = await publicRead.text();
  if (publicRead.status !== 200 || !publicBody.trim()) throw new Error('Function URL could not read the current season');
  if (publicRead.headers.get('access-control-allow-origin') !== publicOrigin || publicRead.headers.has('access-control-allow-credentials')
    || !publicRead.headers.get('access-control-expose-headers')?.toLowerCase().split(/,\s*/).includes('retry-after')) throw new Error('Public response has incorrect CORS headers');
  const preflight = await call('/api/accounts/me', { method: 'OPTIONS', headers: {
    origin: publicOrigin, 'access-control-request-method': 'GET', 'access-control-request-headers': edge ? 'authorization,x-amz-content-sha256,content-type,apollo-require-preflight,idempotency-key' : 'authorization,content-type,apollo-require-preflight,idempotency-key',
  } });
  const allowedHeaders = preflight.headers.get('access-control-allow-headers')?.toLowerCase().split(/,\s*/) ?? [];
  const allowedMethods = preflight.headers.get('access-control-allow-methods')?.split(/,\s*/) ?? [];
  if (preflight.status !== 204 || preflight.headers.get('access-control-allow-origin') !== publicOrigin
    || preflight.headers.has('access-control-allow-credentials') || !allowedMethods.includes('GET')
    || ['authorization', ...(edge ? ['x-amz-content-sha256'] : []), 'content-type', 'apollo-require-preflight', 'idempotency-key'].some(header => !allowedHeaders.includes(header))) {
    throw new Error('Authorized browser preflight failed');
  }
  if (edge) {
    const body = JSON.stringify({ operationName: 'DefaultPositionWeights', variables: {} });
    const graphql = await call('/api/graphql', { method: 'POST', body, headers: {
      origin: publicOrigin, 'content-type': 'application/json', 'apollo-require-preflight': 'true',
      'x-amz-content-sha256': createHash('sha256').update(body).digest('hex'),
    } });
    const payload = await graphql.json();
    if (graphql.status !== 200 || typeof payload.data?.defaultPositionWeights?.GK?.catchesPerGame !== 'number' || payload.errors) throw new Error('CloudFront GraphQL POST failed');
  }
  const protectedRead = await call('/api/accounts/me', { headers: { origin: publicOrigin } });
  if (protectedRead.status !== 401 || protectedRead.headers.get('access-control-allow-origin') !== publicOrigin) throw new Error('Protected Function URL read must reject anonymous access with CORS');
  const rejected = await call('/api/accounts/me', { method: 'OPTIONS', headers: { origin: 'https://untrusted.invalid', 'access-control-request-method': 'GET' } });
  if (rejected.status !== 403 || rejected.headers.has('access-control-allow-origin')) throw new Error('Untrusted browser origin was allowed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { 'function-name': { type: 'string' }, region: { type: 'string' }, url: { type: 'string' }, origin: { type: 'string' }, 'distribution-id': { type: 'string' }, 'domain-name': { type: 'string' } } });
    await smokeDeployment({ functionName: values['function-name'], region: values.region, functionUrl: values.url, publicOrigin: values.origin, distributionId: values['distribution-id'], domainName: values['domain-name'] });
    process.stdout.write('Deployment verified: public database read, protected rejection, CORS, and bounded Function URL permissions.\n');
  } catch {
    process.stderr.write('Deployment smoke check failed. Inspect Lambda status and logs before releasing the frontend.\n');
    process.exitCode = 1;
  }
}
