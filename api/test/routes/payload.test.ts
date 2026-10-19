import test from 'node:test';
import assert from 'node:assert/strict';
import { page, textPage, bytes, PAGE_BYTES, storedImage, pathSegment } from '../../routes/payload/page.js';
import { playerCard, playerSummary } from '../../routes/accounts/dto.js';
import { fieldPage, fieldValue } from '../../routes/payload/details.js';
import type { FastifyRequest } from 'fastify';
import { revision } from '../../routes/payload/page.js';

test('byte-aware pages retain 105 complete records, bind filters and reject changed snapshots', () => {
  const rows = Array.from({ length: 105 }, (_, index) => ({ id: index, label: '球⚽'.repeat(180) }));
  const collected: typeof rows = [];
  let after: string | null = null;
  do {
    const result = page(rows, 'fixture', { first: 50, after });
    assert.ok(bytes(result) <= PAGE_BYTES);
    assert.ok(result.nodes.length > 0);
    collected.push(...result.nodes);
    after = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : null;
  } while (after);
  assert.deepEqual(collected, rows);
  const first = page(rows, 'fixture');
  assert.throws(() => page(rows, 'other-filter', { after: first.pageInfo.endCursor }), /stale_cursor/);
  assert.throws(() => page([...rows, { id: 106, label: '' }], 'fixture', { after: first.pageInfo.endCursor }), /stale_cursor/);
});

test('text pages preserve multibyte, escaped and surrogate content completely', () => {
  const text = '球⚽😀"\\\n\0'.repeat(2000);
  let actual = '', after: string | undefined;
  do {
    const result = textPage(text, 'news-body', after);
    assert.ok(bytes(result) <= PAGE_BYTES);
    actual += result.nodes.join('');
    after = result.pageInfo.hasNextPage ? result.pageInfo.endCursor! : undefined;
  } while (after);
  assert.equal(actual, text);
});

test('selected-season card does not return other seasons, raw history or image data', () => {
  const card = playerCard({ id: 'id', imageUrl: `data:image/png;base64,${'a'.repeat(100_000)}`, stats: {},
    seasonStats: { S1: { goals: 12 }, S2: { goals: 30 } }, cardStats: [{ season: 'S1', cells: [] }],
    awards: [], championships: [], matches: Array.from({ length: 1000 }, () => ({ extension: 'x'.repeat(100) })),
  }, 'S1');
  assert.equal(card.stats.goals, 12);
  assert.match(String(card.imageUrl), /^\/api\/media\/accounts\/id\/image\?v=[\w-]{12}$/);
  assert.ok(bytes(card) < 1000);
  assert.ok(!('matches' in card));
  assert.ok(!('seasonStats' in card));
});

test('legacy field descriptors bind the first value fetch to the exact record revision', () => {
  const record = { extension: '球'.repeat(5000), title: 'original' };
  const request = { query: {} } as FastifyRequest;
  const descriptors = fieldPage(record, '/api/submissions/sub_1/detail', request);
  const large = descriptors.nodes.find(node => node.valueUrl)!;
  const url = new URL(large.valueUrl!, 'http://localhost');
  const read = { query: Object.fromEntries(url.searchParams) } as FastifyRequest;
  const first = fieldValue(record, String(large.index), 'record', read);
  assert.ok(bytes(first) < 10_000);
  assert.throws(() => fieldValue({ ...record, title: 'changed' }, String(large.index), 'record', read), /stale_cursor/);
  assert.throws(() => fieldValue({ title: record.title, extension: record.extension }, String(large.index), 'record', read), /stale_cursor/);
  assert.equal(url.searchParams.get('revision'), revision(record));
});

test('media versions are stable across DTO layers and change when stored bytes change', () => {
  const path = '/api/media/accounts/id/image';
  const first = storedImage('data:image/png;base64,YQ==', path);
  assert.equal(storedImage(storedImage(first, path), path), first);
  assert.notEqual(storedImage('data:image/png;base64,Yg==', path), first);
});

test('IRI path segments preserve exact accepted IDs without percent-inflating Unicode JSON', () => {
  const id = '球😀 /?%# [x]';
  const segment = pathSegment(id);
  assert.equal(decodeURIComponent(new URL(`https://example.test/api/resource/${segment}`).pathname.split('/').at(-1)!), id);
  assert.ok(Buffer.byteLength(segment) < Buffer.byteLength(encodeURIComponent(id)));
  assert.throws(() => pathSegment(String.fromCodePoint(0xD8_00)), URIError);
});

test('routine statistics exclude accepted arbitrary numeric extension keys', () => {
  const stats = { goals: 7, ...Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`legacy-${index}-${'球'.repeat(1000)}`, index])) };
  const summary = playerSummary({ stats, ranking: {} });
  assert.equal(summary.stats.goals, 7);
  assert.equal(Object.keys(summary.stats).length, 12);
  assert.ok(bytes(summary) < 1000);
});
