import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createLambdaUrlServer } from '../../scripts/lambda-url.mjs';

async function listen(t: TestContext, server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('local Function URL defaults to the Lambda service on the Compose network', async t => {
  const previousEndpoint = process.env.LAMBDA_ENDPOINT;
  delete process.env.LAMBDA_ENDPOINT;
  t.after(() => {
    if (previousEndpoint === undefined) delete process.env.LAMBDA_ENDPOINT;
    else process.env.LAMBDA_ENDPOINT = previousEndpoint;
  });
  const request = fetch;
  t.mock.method(globalThis, 'fetch', async (endpoint: string) => {
    assert.equal(endpoint, 'http://lambda:8080/2015-03-31/functions/function/invocations');
    return Response.json({ statusCode: 200, body: 'ready' });
  });
  const origin = await listen(t, createLambdaUrlServer());
  const response = await request(origin);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ready');
});

test('local Function URL preserves HTTP transport and separate auth cookies through RIE', async t => {
  let event: APIGatewayProxyEventV2 | undefined;
  const binary = Buffer.from([0, 255, 128, 42]);
  const endpoint = await listen(t, createServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/2015-03-31/functions/function/invocations');
    const chunks = await Array.fromAsync(req);
    event = JSON.parse(Buffer.concat(chunks).toString());
    res.end(JSON.stringify({
      statusCode: 201, headers: { 'content-type': 'application/octet-stream', 'x-result': 'ok' },
      cookies: ['session=value; HttpOnly; Path=/auth', 'csrf=token; Path=/'],
      body: binary.toString('base64'), isBase64Encoded: true,
    }));
  }));
  const origin = await listen(t, createLambdaUrlServer({ endpoint: `${endpoint}/2015-03-31/functions/function/invocations` }));
  const response = await fetch(`${origin}/auth/callback?tag=one&tag=two&comma=a%2Cb&empty=`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: 'session=sealed; csrf=token', 'x-probe': 'unchanged' }, body: binary,
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-result'), 'ok');
  assert.deepEqual(response.headers.getSetCookie(), ['session=value; HttpOnly; Path=/auth', 'csrf=token; Path=/']);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), binary);
  assert.equal(event?.version, '2.0');
  assert.equal(event.rawPath, '/auth/callback');
  assert.equal(event.rawQueryString, 'tag=one&tag=two&comma=a%2Cb&empty=');
  assert.equal(event.requestContext.http.method, 'POST');
  assert.equal(event.headers['x-probe'], 'unchanged');
  assert.equal(event.headers['x-origin-secret'], undefined);
  assert.deepEqual(event.cookies, ['session=sealed', 'csrf=token']);
  assert.equal(event.isBase64Encoded, true);
  assert.deepEqual(Buffer.from(event.body!, 'base64'), binary);
});

test('local Function URL serializes invocations and keeps working after Lambda errors', async t => {
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const endpoint = await listen(t, createServer(async (_req, res) => {
    calls++;
    active++;
    maximumActive = Math.max(maximumActive, active);
    await setTimeout(10);
    active--;
    res.end(JSON.stringify(calls === 1 ? { errorType: 'UnhandledError', errorMessage: 'private details' }
      : { statusCode: 200, body: 'ready' }));
  }));
  const origin = await listen(t, createLambdaUrlServer({ endpoint }));
  const responses = await Promise.all([fetch(origin), fetch(origin)]);
  assert.deepEqual(responses.map(response => response.status), [502, 200]);
  assert.equal(await responses[0].text(), 'Local Lambda invocation failed');
  assert.equal(await responses[1].text(), 'ready');
  assert.equal(maximumActive, 1);
});

test('local Function URL bounds request sizes and invocation time, with an independent health check', async t => {
  let calls = 0;
  const endpoint = await listen(t, createServer(() => { calls++; }));
  const origin = await listen(t, createLambdaUrlServer({ endpoint, timeoutMs: 100, maxBodyBytes: 4 }));
  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');
  assert.equal((await fetch(origin, { method: 'POST', body: '12345' })).status, 413);
  assert.equal(calls, 0);
  const timeout = await fetch(origin);
  assert.equal(timeout.status, 502);
  assert.equal(await timeout.text(), 'Local Lambda invocation failed');
});
