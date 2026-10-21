import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

export async function collectPage<T>(app: FastifyInstance, path: string, headers: Record<string, string> = {}): Promise<T[]> {
  const nodes: T[] = [];
  let after: string | null = null;
  do {
    const url = new URL(path, 'http://localhost');
    if (after) url.searchParams.set('after', after);
    const response = await app.inject({ url: url.pathname + url.search, headers });
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(Buffer.byteLength(response.body, 'utf8') <= 10_000);
    const page = response.json<{ nodes: T[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } }>();
    nodes.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    assert.ok(!page.pageInfo.hasNextPage || after, 'continuation requires a cursor');
  } while (after);
  return nodes;
}

export async function readFields(app: FastifyInstance, path: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const fields = await collectPage<{ key: string; value?: unknown; valueUrl?: string }>(app, path, headers);
  const entries: Array<[string, unknown]> = [];
  for (const field of fields) {
    if (field.valueUrl) {
      const value = JSON.parse((await collectPage<string>(app, field.valueUrl, headers)).join('')) as { key: string; value: unknown };
      entries.push([value.key, value.value]);
    } else entries.push([field.key, field.value]);
  }
  return Object.fromEntries(entries);
}
