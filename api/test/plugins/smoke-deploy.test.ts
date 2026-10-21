import assert from 'node:assert/strict';
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
  await assert.rejects(smokeDeployment(options, { invoke: inspector(permissions, { AuthType: 'AWS_IAM', FunctionUrl: options.functionUrl }), request: () => assert.fail() }), /use NONE/);
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
