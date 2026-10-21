import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { z } from 'zod';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { config } from './plugins/fixtures.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAPI mixes schema, operation and reference objects at this JSON boundary.
export type OpenApiNode = Record<string, any>;
type Node = OpenApiNode; // Heterogeneous OpenAPI and JSON Schema objects.
export const specification: Node = JSON.parse(readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'));
export const methods = ['get', 'head', 'post', 'put', 'patch', 'delete', 'options'];
function schemaValidator() {
  const instance = addFormats(new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, coerceTypes: false, useDefaults: false, removeAdditional: false }));
  const annotations = new Set(['components', 'example', 'discriminator']);
  const pending: unknown[] = [specification.components.schemas];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('x-')) annotations.add(key);
      pending.push(child);
    }
  }
  instance.addVocabulary([...annotations]);
  return instance;
}
const ajv = schemaValidator();
const validators = new Map();
export function dereference(value: Node): Node {
  while (value.$ref) {
    assert.match(value.$ref, /^#\//, 'references must be local');
    let resolved = specification;
    for (const key of value.$ref.slice(2).split('/')) resolved = resolved[key.replaceAll('~1', '/').replaceAll('~0', '~')];
    value = resolved;
    assert.ok(value, 'unresolved reference');
  }
  return value;
}
export function requestComponent(name: string, source: z.ZodType) {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(source, { io: 'input' });
  const pending: Node[] = [schema];
  while (pending.length > 0) {
    const value = pending.pop()!;
    if (!value || typeof value !== 'object') continue;
    if (typeof value.$ref === 'string' && value.$ref.startsWith('#/$defs/')) value.$ref = `#/components/schemas/${name}${value.$ref.slice(1)}`;
    pending.push(...Object.values(value).filter(child => child && typeof child === 'object'));
  }
  return schema;
}
export function compileSchema(schema: Node) {
  const key = JSON.stringify(schema);
  if (!validators.has(key)) validators.set(key, ajv.compile({ ...schema, components: specification.components }));
  return validators.get(key)!;
}
export function validateSchema(schema: Node, value: unknown, label: string) {
  const validate = compileSchema(schema);
  assert.ok(validate(value), `${label}: ${ajv.errorsText(validate.errors, { separator: '\n' })}`);
}
export function operation(method: string, route: string): Node {
  const value = specification.paths[route]?.[method.toLowerCase()];
  assert.ok(value, `undocumented ${method} ${route}`);
  return value;
}
export const applicationOperations = () => Object.entries(specification.paths).flatMap(([route, item]) => methods.filter(method => method !== 'head' && method !== 'options' && (item as Node)[method]).map(method => `${method.toUpperCase()} ${route}`)).toSorted((a, b) => a.localeCompare(b));
function requestParameters(op: Node, route: string, url: string, headers: Node) {
  const parsed = new URL(url, 'http://localhost');
  if (route !== '/{corsPath}') {
    const expected = route.split('/'), actual = parsed.pathname.split('/');
    assert.equal(actual.length, expected.length, 'request path segment count must match declared operation');
    for (const [index, part] of expected.entries()) if (!part.startsWith('{')) assert.equal(actual[index], part, `request path must match ${route}`);
  }
  const pathValues = route === '/{corsPath}' ? { corsPath: parsed.pathname.slice(1) } : Object.fromEntries(route.split('/').flatMap((part, index) => part.startsWith('{') ? [[part.slice(1, -1), decodeURIComponent(parsed.pathname.split('/')[index] ?? '')]] : []));
  const parameters = op.parameters ?? [];
  for (const raw of parameters) {
    const parameter = dereference(raw), schema = dereference(parameter.schema);
    let value = parameter.in === 'path' ? pathValues[parameter.name] : (parameter.in === 'query' ? parsed.searchParams.get(parameter.name) ?? undefined : headers[parameter.name.toLowerCase()]);
    if (value === undefined) { assert.ok(!parameter.required, `missing ${parameter.in} ${parameter.name}`); continue; }
    const types = new Set([schema.type].flat());
    if (typeof value === 'string' && parameter.in !== 'header') {
      if (types.has('integer') && /^-?\d+$/.test(value)) value = Number(value);
      if (types.has('boolean') && ['true', 'false'].includes(value)) value = value === 'true';
    }
    validateSchema(schema, value, `${route} ${parameter.in} ${parameter.name}`);
  }
}
export function contractClient(app: FastifyInstance) {
  const covered = new Set<string>(), branches = new Set<string>(), heads = new Set<string>();
  async function exchange(method: string, route: string, url: string, options: InjectOptions = {}, expected = 200) {
    const op = operation(method, route), headers = Object.fromEntries(Object.entries({ origin: config.PUBLIC_ORIGIN, ...options.headers }).map(([key, value]) => [key.toLowerCase(), value]));
    if (expected < 400) {
      requestParameters(op, route, url, headers);
      if (op.requestBody && dereference(op.requestBody).required) assert.notEqual(options.payload, undefined, 'required body');
    }
    if (options.payload !== undefined && expected < 400) validateSchema(dereference(op.requestBody).content['application/json'].schema, options.payload, `${method} ${route} request`);
    const response = await app.inject({ ...options, method: method as InjectOptions['method'], url, headers });
    assert.equal(response.statusCode, expected, `${method} ${url}: ${response.body.slice(0, 500)}`);
    const declared = dereference(op.responses[String(expected)] ?? op.responses.default ?? {});
    assert.ok(declared.description, `${route}: undocumented status ${expected}`);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.ok(response.headers['x-request-id']);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.headers['access-control-allow-origin'], config.PUBLIC_ORIGIN);
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
    const declaredHeaders = Object.entries(declared.headers ?? {});
    for (const [name, value] of declaredHeaders) if (response.headers[name.toLowerCase()] !== undefined) validateSchema(dereference(value as Node).schema, response.headers[name.toLowerCase()], `${route} header ${name}`);
    const contentType = String(response.headers['content-type'] ?? '').split(';', 1)[0]!;
    if (method === 'HEAD' || [204, 304].includes(expected)) assert.equal(response.rawPayload.length, 0);
    else if (expected >= 300 && expected < 400) {
      assert.ok(response.headers.location, 'redirect Location');
      const location = declared.headers?.Location ?? declared.headers?.location;
      if (location) validateSchema(dereference(location).schema, response.headers.location, 'redirect Location');
    }
    else {
      assert.ok(declared.content?.[contentType], `${method} ${route}: undocumented media ${contentType}`);
      if (contentType === 'application/json') {
        // Only explicit full article/rule document responses retain the existing long-text exception.
        if (!['/api/rules/{id}', '/api/articles/slug/{slug}'].includes(route) && expected < 400) assert.ok(response.rawPayload.length <= 10_000, `${route}: response exceeds 10000 UTF-8 bytes`);
        const body = response.json(), name = (options.payload as Node | undefined)?.operationName;
        const schema = route === '/api/graphql' && expected === 200 ? { $ref: `#/components/schemas/GraphQL${name}Response` } : declared.content[contentType].schema;
        validateSchema(schema, body, `${method} ${route} response`);
        if (route === '/api/graphql' && expected === 200) { assert.equal(body.errors, undefined, response.body); branches.add(name); }
      } else assert.ok(response.rawPayload.length > 0, 'binary bytes');
    }
    if (method !== 'HEAD' && method !== 'OPTIONS' && expected >= 200 && expected < 400) covered.add(`${method} ${route}`);
    if (method === 'GET' && expected < 400) {
      const head = await app.inject({ ...options, method: 'HEAD', url, headers });
      assert.equal(head.statusCode, expected, `HEAD ${url}`);
      assert.ok(operation('HEAD', route).responses[String(expected)], 'document HEAD status');
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
  return { exchange, covered, branches, heads };
}
export function inventory(app: FastifyInstance) {
  const registered = new Set<string>();
  app.addHook('onRoute', route => { for (const method of [route.method].flat()) registered.add(`${method} ${route.url === '*' ? '/{corsPath}' : route.url.replaceAll(/:([^/]+)/g, '{$1}')}`); });
  return registered;
}
export function assertInventory(registered: Set<string>) {
  const documented = Object.entries(specification.paths).flatMap(([path, item]) => methods.filter(method => (item as Node)[method]).map(method => `${method.toUpperCase()} ${path}`));
  assert.deepEqual([...registered].toSorted((a, b) => a.localeCompare(b)), documented.toSorted((a, b) => a.localeCompare(b)));
  assert.equal(applicationOperations().length, 99);
  assert.equal(registered.size, 151);
}
