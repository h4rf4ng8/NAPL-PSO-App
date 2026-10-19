import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { gql } from '@apollo/client';
import { client, resetClient } from '../src/api/client';
import { TeamRecordsDocument } from '../src/api/generated/graphql';
import { auth } from '../src/auth/session';

afterEach(async () => {
  mock.restoreAll();
  await resetClient();
});

test('public and current account records with the same id remain separate cache entities', () => {
  const query = gql`query AccountCacheCheck {
    accounts { __typename id username }
    me { __typename id username }
  }`;

  client.cache.writeQuery({ query, data: {
    accounts: [{ __typename: 'Account', id: 'same-id', username: 'public-name' }],
    me: { __typename: 'CurrentAccount', id: 'same-id', username: 'private-name' },
  } });

  const records = client.cache.extract();
  assert.equal(records['Account:same-id']?.username, 'public-name', JSON.stringify(records));
  assert.equal(records['CurrentAccount:{"id":"same-id"}']?.username, 'private-name', JSON.stringify(records));
});

test('identity reset keeps a stable client, aborts old requests and ignores late old responses', async () => {
  const oldClient = client;
  const fetchResponse = Promise.withResolvers<Response>();
  let requestSignal: AbortSignal | undefined;
  mock.method(globalThis, 'fetch', (_url: string | URL | Request, init?: RequestInit) => {
    requestSignal = init?.signal ?? undefined;
    return fetchResponse.promise;
  });
  const query = TeamRecordsDocument;
  oldClient.cache.writeQuery({ query, data: { teamRecords: [] } });
  assert.deepEqual(oldClient.cache.readQuery({ query }), { teamRecords: [] });
  const pending = (async () => {
    try {
      await oldClient.query({ query, fetchPolicy: 'network-only' });
    }
    catch { /* Client reset cancels this request. */ }
  })();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(requestSignal, 'request should have started');

  await resetClient();
  const newClient = client;
  assert.equal(newClient, oldClient);
  assert.equal(requestSignal?.aborted, true);
  assert.deepEqual(oldClient.cache.extract(), {});
  assert.deepEqual(newClient.cache.extract(), {});

  fetchResponse.resolve(Response.json({ data: { teamRecords: [] } }));
  await pending;
  assert.deepEqual(newClient.cache.extract(), {});
});

test('local SDK sign-out clears cached identity data without cookies or custom broadcasts', async () => {
  client.cache.writeQuery({ query: TeamRecordsDocument, data: { teamRecords: [] } });
  await auth.signOut();
  assert.deepEqual(client.cache.extract(), {});
});
