import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const api = path.join(root, 'api');
const zip = path.join(api, 'dist/api.zip');
test('SAM template describes the bounded Lambda and direct browser Function URL', async () => {
  const source = (await readFile(path.join(api, 'template.yaml'), 'utf8')).replaceAll(/!(?:Ref|GetAtt|Sub|Not|Equals|If)\b/g, '');
  const template = parse(source);
  assert.deepEqual(template.Transform, ['AWS::LanguageExtensions', 'AWS::Serverless-2016-10-31']);
  const resources = template.Resources;
  const fn = resources.ApiFunction.Properties;
  assert.equal(fn.FunctionName, '${AWS::StackName}-api');
  assert.equal(fn.Runtime, 'nodejs24.x');
  assert.equal(fn.Handler, 'lambda.handler');
  assert.deepEqual(fn.Architectures, ['arm64']);
  assert.equal(fn.MemorySize, 'FunctionMemorySize');
  assert.equal(fn.Timeout, 'FunctionTimeout');
  assert.deepEqual(fn.ReservedConcurrentExecutions, ['HasReservedConcurrency', 'ReservedConcurrency', 'AWS::NoValue']);
  assert.equal(template.Parameters.ReservedConcurrency.Default, -1);
  assert.equal(resources.ApiRole.Properties.PermissionsBoundary, 'RolePermissionsBoundaryArn');
  assert.equal(resources.VercelInvokeRole, undefined);
  assert.equal(resources.VercelOidcProvider, undefined);
  assert.equal(fn.AutoPublishAlias, 'live');
  assert.equal(fn.AutoPublishAliasAllProperties, true);
  assert.equal(fn.FunctionUrlConfig.AuthType, 'NONE');
  assert.equal(fn.FunctionUrlConfig.InvokeMode, 'BUFFERED');
  assert.equal(resources.ApiLogGroup.Properties.RetentionInDays, 14);
  assert.deepEqual(resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement[0].Action, ['logs:CreateLogStream', 'logs:PutLogEvents']);
  assert.equal(resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement[0].Resource, '${ApiLogGroup.Arn}:*');
  assert.equal(fn.FunctionUrlConfig.Cors, undefined);
  assert.equal(template.Parameters.DatabaseUrl.NoEcho, true);
  assert.equal(fn.Environment.Variables.NODE_ENV, 'production');
  assert.equal(fn.Environment.Variables.DATABASE_URL, 'DatabaseUrl');
  assert.equal(fn.Environment.Variables.SUPABASE_URL, 'SupabaseUrl');
  assert.equal(fn.Environment.Variables.SUPABASE_JWKS_URL, 'SupabaseJwksUrl');
  assert.deepEqual(Object.keys(fn.Environment.Variables).filter(name => name.endsWith('DATABASE_URL')), ['DATABASE_URL']);
  for (const name of ['SUPABASE_SECRET_KEY', 'COOKIE_KEYS', 'ORIGIN_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID']) assert.equal(fn.Environment.Variables[name], undefined);
  assert.equal(fn.Environment.Variables.DISCORD_TRANSFER_WEBHOOK[2], 'AWS::NoValue');
  assert.ok(Object.values(resources).every(resource => !['AWS::ApiGateway::RestApi', 'AWS::CloudFront::Distribution'].includes(resource.Type)));
  assert.ok(Object.keys(fn).every(key => !['VpcConfig', 'ProvisionedConcurrencyConfig'].includes(key)));
});

test('Lambda ZIP loads outside the repository and supports direct CORS and rejects missing bearer before upstream access', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'napl-lambda-package-'));
  const original = new Map();
  const canary = `lambda-package-secret-${randomUUID()}`;
  const values = {
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://localhost:5173',
    SUPABASE_URL: 'https://invalid-supabase.example.test',
    SUPABASE_JWKS_URL: 'https://invalid-supabase.example.test/auth/v1/.well-known/jwks.json',
    SUPABASE_PUBLISHABLE_KEY: `publishable-${canary}`,
    DATABASE_URL: `postgresql://unused:${canary}@127.0.0.1:1/test`,
  };
  for (const [name, value] of Object.entries(values)) {
    original.set(name, process.env[name]);
    process.env[name] = value;
  }
  try {
    await exec('unzip', ['-q', zip, '-d', scratch]);
    const files = [];
    const walk = async (dir, prefix = '') => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relative = path.posix.join(prefix, entry.name);
        assert.ok(!/(^|\/)(web|test|node_modules|\.env)(\/|$)/i.test(relative), `unexpected packaged path ${relative}`);
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative);
        else files.push(relative);
      }
    };
    await walk(scratch);
    assert.deepEqual(files.toSorted((left, right) => left.localeCompare(right)), ['lambda.js', 'package.json']);
    const packageJson = JSON.parse(await readFile(path.join(scratch, 'package.json'), 'utf8'));
    assert.deepEqual(packageJson, { type: 'module' });
    const bundle = await readFile(path.join(scratch, 'lambda.js'), 'utf8');
    for (const secret of [values.SUPABASE_PUBLISHABLE_KEY, values.DATABASE_URL]) {
      assert.ok(!bundle.includes(secret), 'runtime configuration must not be bundled into code');
    }

    const { handler } = await import(pathToFileURL(path.join(scratch, 'lambda.js')).href);
    const event = (headers = {}) => ({
      version: '2.0', routeKey: '$default', rawPath: '/api/users/me', rawQueryString: '', headers,
      requestContext: {
        accountId: '123456789012', apiId: 'package-test', domainName: 'package-test.lambda-url.us-east-1.on.aws', domainPrefix: 'package-test',
        http: { method: 'GET', path: '/api/users/me', protocol: 'HTTP/1.1', sourceIp: '203.0.113.8', userAgent: 'package-test' },
        requestId: randomUUID(), routeKey: '$default', stage: '$default', time: new Date().toUTCString(), timeEpoch: Date.now(),
      },
      isBase64Encoded: false,
    });
    const context = {
      callbackWaitsForEmptyEventLoop: false,
      functionVersion: '$LATEST', functionName: 'napl-package-test', memoryLimitInMB: '512',
      logGroupName: '/aws/lambda/napl-package-test', logStreamName: 'test', awsRequestId: randomUUID(),
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:napl-package-test',
      getRemainingTimeInMillis: () => 10_000,
    };
    const direct = await handler(event({ origin: values.PUBLIC_ORIGIN, cookie: 'napl-access=obsolete', 'x-real-ip': '203.0.113.8' }), context);
    assert.equal(direct.statusCode, 401);
    assert.equal(direct.headers['access-control-allow-origin'], values.PUBLIC_ORIGIN);
    assert.equal(direct.headers['access-control-allow-credentials'], undefined);
    const preflight = event({ origin: values.PUBLIC_ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' });
    preflight.requestContext.http.method = 'OPTIONS';
    assert.equal((await handler(preflight, context)).statusCode, 204);

    const graphql = {
      ...event({
        origin: values.PUBLIC_ORIGIN, 'content-type': 'text/plain',
      }),
      rawPath: '/api/default-position-weights', body: JSON.stringify({ variables: {} }),
      requestContext: {
        ...event().requestContext,
        http: { ...event().requestContext.http, method: 'POST', path: '/api/default-position-weights' },
      },
    };
    for (let call = 0; call < 2; call++) {
      const response = await handler(graphql, context);
      assert.equal(response.statusCode, 400);
      assert.equal(JSON.parse(response.body).errors[0].extensions.code, 'BAD_REQUEST');
    }

    const integration = Boolean(process.env.API_TEST_DATABASE_URL);
    if (integration) {
      const moduleUrl = pathToFileURL(path.join(scratch, 'lambda.js')).href;
      const childScript = `
        import assert from 'node:assert/strict';
        const { handler } = await import(${JSON.stringify(moduleUrl)});
        const request = {
          version: '2.0', routeKey: '$default', rawPath: '/api/accounts', rawQueryString: '',
          headers: { origin: process.env.PUBLIC_ORIGIN },
          requestContext: {
            accountId: '123456789012', apiId: 'package-test', domainName: 'package-test.lambda-url.us-east-1.on.aws', domainPrefix: 'package-test',
            http: { method: 'GET', path: '/api/accounts', protocol: 'HTTP/1.1', sourceIp: '203.0.113.9', userAgent: 'package-test' },
            requestId: 'package-test', routeKey: '$default', stage: '$default', time: new Date().toUTCString(), timeEpoch: Date.now(),
          },
          isBase64Encoded: false,
        };
        const context = {
          callbackWaitsForEmptyEventLoop: false, functionVersion: '$LATEST', functionName: 'napl-package-test',
          memoryLimitInMB: '512', logGroupName: '/aws/lambda/napl-package-test', logStreamName: 'test',
          awsRequestId: 'package-test', invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:napl-package-test',
          getRemainingTimeInMillis: () => 10_000,
        };
        const response = await handler(request, context);
        assert.equal(response.statusCode, 200);
        assert.ok(Array.isArray(JSON.parse(response.body)));
        const auth = await handler({
          ...request, rawPath: '/api/users/me',
          requestContext: { ...request.requestContext, http: { ...request.requestContext.http, path: '/api/users/me' } },
        }, context);
        assert.equal(auth.statusCode, 401);
        const graphql = {
          ...request, rawPath: '/api/default-position-weights', body: JSON.stringify({ variables: {} }),
          headers: { ...request.headers, origin: process.env.PUBLIC_ORIGIN, 'content-type': 'application/json' },
          requestContext: { ...request.requestContext, http: { ...request.requestContext.http, method: 'POST', path: '/api/default-position-weights' } },
        };
        for (let call = 0; call < 2; call++) {
          const result = await handler(graphql, context);
          assert.equal(result.statusCode, 200);
          assert.ok(JSON.parse(result.body).data.defaultPositionWeights);
          assert.equal(result.cookies, undefined);
        }
        process.exit(0);
      `;
      const env = {
        ...process.env,
        DATABASE_URL: process.env.API_TEST_DATABASE_URL,
      };
      let stdout;
      try {
        ({ stdout } = await exec(process.execPath, ['--input-type=module', '-e', childScript], { env, timeout: 15_000 }));
      } catch {
        assert.fail('Extracted Lambda ZIP could not use application and auth state through the application database connection URL.');
      }
      assert.ok(!stdout.includes(canary), 'child output must not include secrets');
    }
  } finally {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(scratch, { recursive: true, force: true });
  }
});
