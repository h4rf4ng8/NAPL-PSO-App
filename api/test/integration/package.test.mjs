import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
test('SAM template describes the bounded Lambda and IAM-protected Function URL', async () => {
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
  assert.equal(resources.VercelInvokeRole.Properties.PermissionsBoundary, 'RolePermissionsBoundaryArn');
  assert.equal(fn.AutoPublishAlias, 'live');
  assert.equal(fn.AutoPublishAliasAllProperties, true);
  assert.equal(fn.FunctionUrlConfig.AuthType, 'AWS_IAM');
  assert.equal(fn.FunctionUrlConfig.InvokeMode, 'BUFFERED');
  assert.equal(resources.ApiLogGroup.Properties.RetentionInDays, 14);
  assert.deepEqual(resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement[0].Action, ['logs:CreateLogStream', 'logs:PutLogEvents']);
  assert.equal(resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement[0].Resource, '${ApiLogGroup.Arn}:*');
  assert.ok(Object.values(template.Parameters).some(parameter => parameter.NoEcho && parameter.Description?.toLowerCase().includes('origin secret')));
  assert.equal(template.Parameters.DatabaseUrl.NoEcho, true);
  assert.equal(fn.Environment.Variables.NODE_ENV, 'production');
  assert.equal(fn.Environment.Variables.DATABASE_URL, 'DatabaseUrl');
  assert.equal(fn.Environment.Variables.SUPABASE_URL, 'SupabaseUrl');
  assert.equal(fn.Environment.Variables.SUPABASE_JWKS_URL, 'SupabaseJwksUrl');
  assert.deepEqual(Object.keys(fn.Environment.Variables).filter(name => name.endsWith('DATABASE_URL')), ['DATABASE_URL']);
  assert.equal(fn.Environment.Variables.SUPABASE_SECRET_KEY[2], 'AWS::NoValue');
  assert.equal(fn.Environment.Variables.DISCORD_TRANSFER_WEBHOOK[2], 'AWS::NoValue');
  assert.ok(Object.values(resources).every(resource => !['AWS::ApiGateway::RestApi', 'AWS::CloudFront::Distribution'].includes(resource.Type)));
  assert.ok(Object.keys(fn).every(key => !['VpcConfig', 'ProvisionedConcurrencyConfig'].includes(key)));
});

test('Lambda ZIP loads outside the repository and rejects direct calls before upstream access', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'napl-lambda-package-'));
  const original = new Map();
  const canary = `lambda-package-secret-${randomUUID()}`;
  const values = {
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://localhost:5173',
    SUPABASE_URL: 'https://invalid-supabase.example.test',
    SUPABASE_JWKS_URL: 'https://invalid-supabase.example.test/auth/v1/.well-known/jwks.json',
    SUPABASE_PUBLISHABLE_KEY: `publishable-${canary}`,
    DISCORD_CLIENT_ID: '123456789',
    DISCORD_CLIENT_SECRET: `discord-${canary}`,
    DISCORD_GUILD_ID: '987654321',
    DATABASE_URL: `postgresql://unused:${canary}@127.0.0.1:1/test`,
    COOKIE_KEYS: JSON.stringify({ test: randomBytes(32).toString('base64') }),
    ORIGIN_SECRET: `origin-${canary}-must-not-be-bundled`,
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
    for (const secret of [values.SUPABASE_PUBLISHABLE_KEY, values.DISCORD_CLIENT_SECRET, values.DATABASE_URL, values.ORIGIN_SECRET]) {
      assert.ok(!bundle.includes(secret), 'runtime configuration must not be bundled into code');
    }

    const { handler } = await import(pathToFileURL(path.join(scratch, 'lambda.js')).href);
    const event = (headers = {}) => ({
      version: '2.0', routeKey: '$default', rawPath: '/auth/csrf', rawQueryString: '', headers,
      requestContext: {
        accountId: '123456789012', apiId: 'package-test', domainName: 'package-test.lambda-url.us-east-1.on.aws', domainPrefix: 'package-test',
        http: { method: 'GET', path: '/auth/csrf', protocol: 'HTTP/1.1', sourceIp: '203.0.113.8', userAgent: 'package-test' },
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
    const direct = await handler(event({ 'x-real-ip': '203.0.113.8' }), context);
    assert.equal(direct.statusCode, 403);

    const accepted = () => handler(event({
      'x-real-ip': '203.0.113.8',
      'x-origin-secret': values.ORIGIN_SECRET,
    }), context);
    for (let call = 0; call < 2; call++) {
      const response = await accepted();
      assert.equal(response.statusCode, 503);
      assert.equal(response.headers['retry-after'], '1');
    }

    const graphql = {
      ...event({
        'x-real-ip': '203.0.113.8', 'x-origin-secret': values.ORIGIN_SECRET,
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
          headers: { 'x-real-ip': '203.0.113.9', 'x-origin-secret': process.env.ORIGIN_SECRET },
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
          ...request, rawPath: '/auth/csrf',
          requestContext: { ...request.requestContext, http: { ...request.requestContext.http, path: '/auth/csrf' } },
        }, context);
        assert.equal(auth.statusCode, 200);
        assert.equal(typeof JSON.parse(auth.body).csrfToken, 'string');
        assert.ok(auth.cookies.some(cookie => cookie.startsWith('napl-csrf=')));
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
        COOKIE_KEYS: JSON.stringify({ package: randomBytes(32).toString('base64') }),
      };
      let stdout;
      try {
        ({ stdout } = await exec(process.execPath, ['--input-type=module', '-e', childScript], { env, timeout: 15_000 }));
      } catch {
        assert.fail('Extracted Lambda ZIP could not use application and auth state through one database connection URL.');
      }
      assert.ok(!stdout.includes(values.ORIGIN_SECRET), 'child output must not include secrets');
    }
  } finally {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(scratch, { recursive: true, force: true });
  }
});
