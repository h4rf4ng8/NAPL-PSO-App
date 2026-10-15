import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../../plugins/auth/identity.js';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { accountMatches } from '../../routes/accounts/history.js';

const id = '11111111-1111-4111-8111-111111111111';
const match = (n: number) => ({
  id: `match-${n}`, date: n, season: 'S2', opponent: 'Blue', result: 'W', goals: 1, assists: 0, passes: 20,
  tackles: 0, deflects: 0, catches: 0, cleanSheet: false, motm: false,
});

function fakeDatabase(page: (call: number) => { version: string; rows: Row[] }) {
  let calls = 0;
  const statements: string[] = [];
  const database: Database = {
    query: async <T extends Row>(sql: Prisma.Sql) => {
      statements.push(sql.sql);
      return page(calls++).rows.map(row => ({ version: pageVersion, ...row })) as T[];
    },
    execute: async () => 0,
    transaction: async work => work(database),
    close: async () => {},
  };
  let pageVersion = '1';
  return { database, statements, setVersion: (version: string) => { pageVersion = version; }, get calls() { return calls; } };
}

test('match history pages use a bound cursor and reject stale snapshots', async () => {
  const fake = fakeDatabase(call => ({ version: call ? '1' : '1', rows: call
    ? [{ match: match(2), ordinality: 2 }]
    : [{ match: match(1), ordinality: 1 }, { match: match(2), ordinality: 2 }] }));
  const first = await accountMatches(fake.database, { id, first: 1 });
  assert.deepEqual(first.nodes.map(node => node.id), ['match-1']);
  assert.equal(first.pageInfo.hasNextPage, true);
  assert.ok(first.pageInfo.endCursor);
  assert.match(fake.statements[0]!, /WITH ORDINALITY/);
  assert.match(fake.statements[0]!, /LIMIT/);

  const second = await accountMatches(fake.database, { id, first: 1, after: first.pageInfo.endCursor });
  assert.deepEqual(second.nodes.map(node => node.id), ['match-2']);
  assert.equal(second.pageInfo.hasNextPage, false);

  fake.setVersion('2');
  await assert.rejects(() => accountMatches(fake.database, { id, first: 1, after: first.pageInfo.endCursor }),
    error => error instanceof HttpError && error.status === 409 && error.code === 'stale_cursor');
});

test('match history validates bounds and binds cursors to account and filters', async () => {
  const fake = fakeDatabase(() => ({ version: '1', rows: [{ match: match(1), ordinality: 1 }] }));
  await assert.rejects(() => accountMatches(fake.database, { id, first: 0 }),
    error => error instanceof Error);
  const page = await accountMatches(fake.database, { id, first: 1, season: 'S2' });
  assert.ok(page.pageInfo.endCursor);
  await assert.rejects(() => accountMatches(fake.database, { id, first: 1, season: 'S1', after: page.pageInfo.endCursor }),
    error => error instanceof HttpError && error.status === 400 && error.code === 'cursor_filter_mismatch');
  await assert.rejects(() => accountMatches(fake.database, { id, first: 1, after: 'forged' }),
    error => error instanceof HttpError && error.status === 400 && error.code === 'invalid_cursor');
});
