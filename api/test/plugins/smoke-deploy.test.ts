import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { smokeDeployment } from '../../scripts/smoke-deploy.mjs';

const options = {
  functionName: 'napl-api-api:live', region: 'us-east-2',
  functionUrl: 'https://example.lambda-url.us-east-2.on.aws/', originSecret: 'private-origin-secret-'.repeat(3),
};
const urlConfiguration = { stdout: JSON.stringify({ AuthType: 'AWS_IAM', FunctionUrl: options.functionUrl }) };

test('smoke check invokes the live alias with a private payload and cleans up', async () => {
  let payloadPath = '';
  await smokeDeployment(options, {
    request: async (url: URL, settings: RequestInit) => {
      assert.equal(url.pathname, '/api/settings/current_season');
      assert.equal(settings.headers, undefined);
      return { status: 403 };
    },
    invoke: async (command: string, args: string[]) => {
      assert.equal(command, 'aws');
      if (args[1] === 'get-function-url-config') {
        assert.equal(args[args.indexOf('--qualifier') + 1], 'live');
        return urlConfiguration;
      }
      assert.equal(args[args.indexOf('--function-name') + 1], options.functionName);
      assert.ok(!args.join(' ').includes(options.originSecret));
      payloadPath = args[args.indexOf('--payload') + 1].slice('file://'.length);
      assert.equal((await stat(payloadPath)).mode & 0o777, 0o600);
      const event = JSON.parse(await readFile(payloadPath, 'utf8'));
      assert.equal(event.headers['x-origin-secret'], options.originSecret);
      assert.equal(event.requestContext.http.method, 'GET');
      assert.equal(event.rawPath, '/api/settings/current_season');
      await writeFile(args.at(-1)!, JSON.stringify({ statusCode: 200, body: 'S1' }));
      return { stdout: JSON.stringify({ StatusCode: 200, ExecutedVersion: '1' }) };
    },
  });
  await assert.rejects(stat(path.dirname(payloadPath)), { code: 'ENOENT' });
});

test('smoke check rejects a public Function URL even when the API itself would return 403', async () => {
  await assert.rejects(smokeDeployment(options, {
    request: () => assert.fail('must reject public configuration before making a request'),
    invoke: async () => ({ stdout: JSON.stringify({ AuthType: 'NONE', FunctionUrl: options.functionUrl }) }),
  }), /require AWS IAM/);
});

test('smoke check requires anonymous HTTP access to be denied', async () => {
  await assert.rejects(smokeDeployment(options, {
    request: async () => ({ status: 200 }),
    invoke: async (_command: string, args: string[]) => {
      assert.equal(args[1], 'get-function-url-config');
      return urlConfiguration;
    },
  }), /did not reject anonymous access/);
});

test('smoke check detects runtime and database failures and removes secret files', async () => {
  for (const failure of ['invoke', 'runtime', 'database', 'unpublished']) {
    let directory = '';
    await assert.rejects(smokeDeployment(options, {
      request: async () => ({ status: 403 }),
      invoke: async (_command: string, args: string[]) => {
        if (args[1] === 'get-function-url-config') return urlConfiguration;
        directory = path.dirname(args.at(-1)!);
        if (failure === 'invoke') throw new Error(options.originSecret);
        await writeFile(args.at(-1)!, JSON.stringify({ statusCode: failure === 'database' ? 503 : 200, body: 'S1' }));
        return { stdout: JSON.stringify({ StatusCode: 200, ExecutedVersion: failure === 'unpublished' ? '$LATEST' : '2', ...(failure === 'runtime' && { FunctionError: 'Unhandled' }) }) };
      },
    }), (error: Error) => {
      assert.ok(!error.message.includes(options.originSecret));
      return true;
    });
    await assert.rejects(stat(directory), { code: 'ENOENT' });
  }
});
