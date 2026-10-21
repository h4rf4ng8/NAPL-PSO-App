import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { config } from './plugins/fixtures.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test fixtures inspect heterogeneous JSON responses.
export type ResponseBody = Record<string, any>;
export const applicationOperations = (registered: Set<string>) => [...registered].filter(key => !key.startsWith('HEAD ') && !key.startsWith('OPTIONS ')).toSorted((a, b) => a.localeCompare(b));
export function contractClient(app: FastifyInstance) {
  const registered = inventory(app);
  const covered = new Set<string>(), branches = new Set<string>(), heads = new Set<string>();
  async function exchange(method: string, route: string, url: string, options: InjectOptions = {}, expected = 200) {
    const headers = Object.fromEntries(Object.entries({ origin: config.PUBLIC_ORIGIN, ...options.headers }).map(([key, value]) => [key.toLowerCase(), value]));
    await app.ready();
    assert.ok(registered.has(`${method} ${route}`), `unregistered ${method} ${route}`);
    if (route !== '/{corsPath}') {
      const expectedPath = route.split('/'), actualPath = new URL(url, 'http://localhost').pathname.split('/');
      assert.equal(actualPath.length, expectedPath.length, 'request path segment count');
      for (const [index, part] of expectedPath.entries()) if (!part.startsWith('{')) assert.equal(actualPath[index], part, `request path must match ${route}`);
    }
    const response = await app.inject({ ...options, method: method as InjectOptions['method'], url, headers });
    assert.equal(response.statusCode, expected, `${method} ${url}: ${response.body.slice(0, 500)}`);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.ok(response.headers['x-request-id']);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.headers['access-control-allow-origin'], config.PUBLIC_ORIGIN);
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
    const contentType = String(response.headers['content-type'] ?? '').split(';', 1)[0]!;
    if (method === 'HEAD' || [204, 304].includes(expected)) assert.equal(response.rawPayload.length, 0);
    else if (expected >= 300 && expected < 400) {
      assert.ok(response.headers.location, 'redirect Location');
    }
    else {
      assert.ok(contentType, `${method} ${route}: missing content type`);
      if (contentType === 'application/json') {
        // Only explicit full article/rule document responses retain the existing long-text exception.
        if (!['/api/rules/{id}', '/api/articles/slug/{slug}'].includes(route) && expected < 400) assert.ok(response.rawPayload.length <= 10_000, `${route}: response exceeds 10000 UTF-8 bytes`);
        const body = response.json(), name = (options.payload as ResponseBody | undefined)?.operationName;
        assert.ok(body && typeof body === 'object', `${method} ${route}: JSON response object`);
        if (route === '/api/graphql' && expected === 200) { assert.equal(body.errors, undefined, response.body); assert.ok(body.data && typeof body.data === 'object', 'GraphQL data'); branches.add(String(name)); }
      } else {
        assert.ok(route.startsWith('/api/media/'), 'only media routes send binary responses');
        assert.match(contentType, /^image\//);
        assert.ok(response.rawPayload.length > 0, 'binary bytes');
      }
    }
    if (method !== 'HEAD' && method !== 'OPTIONS' && expected >= 200 && expected < 400) covered.add(`${method} ${route}`);
    if (method === 'GET' && expected < 400) {
      const head = await app.inject({ ...options, method: 'HEAD', url, headers });
      assert.equal(head.statusCode, expected, `HEAD ${url}`);
      assert.ok(registered.has(`HEAD ${route}`), 'registered HEAD route');
      assert.equal(head.headers['content-type'], response.headers['content-type']);
      assert.ok(head.headers['x-request-id']);
      assert.equal(head.headers['access-control-allow-origin'], config.PUBLIC_ORIGIN);
      assert.equal(head.headers['x-content-type-options'], 'nosniff');
      if (response.headers.location) assert.equal(head.headers.location, response.headers.location);
      assert.equal(head.rawPayload.length, 0);
      assert.equal(head.headers['cache-control'], 'no-store');
      heads.add(route);
    }
    return response;
  }
  return { exchange, covered, branches, heads, registered };
}
export function inventory(app: FastifyInstance) {
  const registered = new Set<string>();
  app.addHook('onRoute', route => { for (const method of [route.method].flat()) registered.add(`${method} ${route.url === '*' ? '/{corsPath}' : route.url.replaceAll(/:([^/]+)/g, '{$1}')}`); });
  return registered;
}
export function assertInventory(registered: Set<string>) {
  assert.equal(applicationOperations(registered).length, 99);
  assert.equal(registered.size, 151);
}
