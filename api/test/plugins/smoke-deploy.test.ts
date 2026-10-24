import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { smokeDeployment } from '../../scripts/smoke-deploy.mjs';

const options = { functionName: 'napl-api-api:live', region: 'us-east-2', functionUrl: 'https://example.lambda-url.us-east-2.on.aws/', publicOrigin: 'https://league.example' };
const permissions = [
  { Effect: 'Allow', Principal: '*', Action: 'lambda:InvokeFunctionUrl', Condition: { StringEquals: { 'lambda:FunctionUrlAuthType': 'NONE' } } },
  { Effect: 'Allow', Principal: '*', Action: 'lambda:InvokeFunction', Condition: { Bool: { 'lambda:InvokedViaFunctionUrl': 'true' } } },
];
const urlConfiguration = { AuthType: 'NONE', FunctionUrl: options.functionUrl };
const inspector = (statements = permissions, configuration = urlConfiguration) => async (_command: string, args: string[]) => {
  assert.equal(args[args.indexOf('--qualifier') + 1], 'live');
  return { stdout: JSON.stringify(args[1] === 'get-policy' ? { Policy: JSON.stringify({ Statement: statements }) } : configuration) };
};
const response = (status: number, origin?: string) => new Response(status === 200 ? 'S1' : null, { status, headers: origin ? { 'access-control-allow-origin': origin, 'access-control-expose-headers': 'Retry-After' } : {} });
const request = async (url: URL, settings: RequestInit) => {
  assert.equal(settings.credentials, undefined);
  if (url.pathname.endsWith('current_season')) return response(200, options.publicOrigin);
  if (settings.method === 'OPTIONS') {
    return (settings.headers as Record<string, string>).origin === options.publicOrigin ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': options.publicOrigin, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'Authorization, Content-Type, Apollo-Require-Preflight, Idempotency-Key' } }) : response(403);
  }
  return response(401, options.publicOrigin);
};
test('checks public reads, protected rejection, allowed/rejected preflights and bounded URL permissions', async () => {
  let calls = 0;
  await smokeDeployment(options, { invoke: inspector(), request: async (url: URL, settings: RequestInit) => { calls++; return request(url, settings); } });
  assert.equal(calls, 4);
});
test('rejects IAM configuration and missing/unrestricted public invoke permissions before HTTP', async () => {
  await assert.rejects(smokeDeployment(options, { invoke: inspector(permissions, { AuthType: 'AWS_IAM', FunctionUrl: options.functionUrl }), request: () => assert.fail() }), /expected auth type/);
  for (const statements of [permissions.slice(0, 1), [...permissions, { Effect: 'Allow', Principal: '*', Action: 'lambda:InvokeFunction', Condition: {} }]]) {
    await assert.rejects(smokeDeployment(options, { invoke: inspector(statements), request: () => assert.fail() }), /bounded public URL permissions/);
  }
});
test('detects public database failure and missing CORS', async () => {
  await assert.rejects(smokeDeployment(options, { invoke: inspector(), request: async () => response(503) }), /could not read/);
  await assert.rejects(smokeDeployment(options, { invoke: inspector(), request: async () => response(200) }), /incorrect CORS/);
});

test('rejects wildcard public invoke access and permissive untrusted preflights', async () => {
  for (const action of ['*', 'lambda:*', 'lambda:Invoke*']) {
    const statements = [...permissions, { Effect: 'Allow', Principal: '*', Action: action, Condition: {} }];
    await assert.rejects(smokeDeployment(options, { invoke: inspector(statements), request: () => assert.fail() }), /bounded public URL permissions/);
  }
  for (const origin of ['*', 'https://untrusted.invalid']) {
    await assert.rejects(smokeDeployment(options, { invoke: inspector(), request: async (url: URL, settings: RequestInit) =>
      (settings.headers as Record<string, string>).origin === 'https://untrusted.invalid' ? response(403, origin) : request(url, settings) }), /Untrusted browser origin/);
  }
});


const edgeOptions = { ...options, distributionId: 'E123', domainName: 'edge.cloudfront.net' };
const edgePermissions = permissions.map((statement, index) => ({
  ...statement, Principal: { Service: 'cloudfront.amazonaws.com' },
  Condition: { ...(index === 0 ? { StringEquals: { 'lambda:FunctionUrlAuthType': 'AWS_IAM' } } : statement.Condition), ArnLike: { 'AWS:SourceArn': 'arn:aws:cloudfront::123456789012:distribution/E123' } },
}));
const edgeInspector = (statements = edgePermissions) => async (command: string, args: string[]) => {
  if (args[0] === 'lambda') return inspector(statements, { AuthType: 'AWS_IAM', FunctionUrl: options.functionUrl })(command, args);
  if (args[0] === 'wafv2') return { stdout: JSON.stringify({ WebACL: { Rules: [{ Action: { Block: {} }, Statement: { RateBasedStatement: { AggregateKeyType: 'IP' } } }] } }) };
  if (args[1] === 'get-origin-access-control') return { stdout: JSON.stringify({ OriginAccessControl: { OriginAccessControlConfig: { OriginAccessControlOriginType: 'lambda', SigningBehavior: 'always', SigningProtocol: 'sigv4' } } }) };
  return { stdout: JSON.stringify({ Distribution: { DomainName: edgeOptions.domainName, DistributionConfig: {
    Enabled: true, WebACLId: 'arn:aws:wafv2:us-east-1:123456789012:global/webacl/napl-api-edge/id',
    DefaultCacheBehavior: { TargetOriginId: 'api', CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', FunctionAssociations: { Items: [{ EventType: 'viewer-request', FunctionARN: 'arn:aws:cloudfront::123456789012:function/napl-api-edge' }] } },
    Origins: { Items: [{ Id: 'api', DomainName: new URL(options.functionUrl).hostname, OriginAccessControlId: 'OAC', CustomOriginConfig: { OriginProtocolPolicy: 'https-only' } }] },
  } } }) };
};
test('CloudFront smoke verifies locked origin, OAC, WAF and signed GraphQL POST', async () => {
  let posts = 0;
  await smokeDeployment(edgeOptions, { invoke: edgeInspector(), request: async (url: URL, settings: RequestInit) => {
    if (url.hostname.endsWith('.on.aws')) return response(403);
    assert.equal(url.hostname, edgeOptions.domainName);
    if (url.pathname === '/api/graphql') {
      posts++;
      assert.deepEqual(JSON.parse(settings.body as string), { operationName: 'DefaultPositionWeights', variables: {} });
      assert.equal((settings.headers as Record<string, string>)['x-amz-content-sha256'], createHash('sha256').update(settings.body as string).digest('hex'));
      return Response.json({ data: { defaultPositionWeights: { GK: { catchesPerGame: 0.3 } } } });
    }
    if (settings.method === 'OPTIONS' && (settings.headers as Record<string, string>).origin === options.publicOrigin) return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': options.publicOrigin, 'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'Authorization, X-Amz-Content-Sha256, Content-Type, Apollo-Require-Preflight, Idempotency-Key',
    } });
    return request(url, settings);
  } });
  assert.equal(posts, 1);
});
test('CloudFront smoke rejects public permissions and wrong distribution grants before HTTP', async () => {
  for (const grants of [[...edgePermissions, ...permissions], edgePermissions.map(statement => ({ ...statement, Condition: { ...statement.Condition, ArnLike: { 'AWS:SourceArn': 'arn:aws:cloudfront::123456789012:distribution/OTHER' } } }))]) {
    await assert.rejects(smokeDeployment(edgeOptions, { invoke: edgeInspector(grants), request: () => assert.fail() }), /exact distribution-only/);
  }
});


test('CloudFront smoke rejects caching, unsigned origins and missing WAF protection', async () => {
  for (const field of ['cache', 'oac', 'waf', 'function']) {
    const invoke = async (command: string, args: string[]) => {
      const result = await edgeInspector()(command, args);
      const body = JSON.parse(result.stdout);
      if (args[1] === 'get-distribution') {
        switch (field) {
        case 'cache': {
        body.Distribution.DistributionConfig.DefaultCacheBehavior.CachePolicyId = 'unsafe-cache';
        break;
        }
        case 'waf': {
        body.Distribution.DistributionConfig.WebACLId = '';
        break;
        }
        case 'function': {
        body.Distribution.DistributionConfig.DefaultCacheBehavior.FunctionAssociations = { Items: [] };
        break;
        }
        // No default
        }
      }
      if (field === 'oac' && args[1] === 'get-origin-access-control') body.OriginAccessControl.OriginAccessControlConfig.SigningBehavior = 'never';
      return { stdout: JSON.stringify(body) };
    };
    await assert.rejects(smokeDeployment(edgeOptions, { invoke, request: () => assert.fail() }), /CloudFront/);
  }
});
