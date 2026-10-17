import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { gql } from '@apollo/client';
import { getClient, resetClient } from '../src/api/client';
import { TeamRecordsDocument } from '../src/api/generated/graphql';

const restoreGlobal = (key: 'document' | 'localStorage', value: unknown) => {
  if (value === undefined) Reflect.deleteProperty(globalThis, key);
  else Object.defineProperty(globalThis, key, { configurable: true, value });
};

function installBrowserStorage() {
  const previousDocument = (globalThis as typeof globalThis & { document?: Document }).document;
  const previousStorage = typeof localStorage === 'undefined' ? undefined : localStorage;
  const values = new Map<string, string>([['asl_theme', 'light']]);
  const documentStub = { cookie: 'napl-csrf=csrf', documentElement: { dataset: {} as DOMStringMap } } as Document;
  const storageStub = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: documentStub },
    localStorage: { configurable: true, value: storageStub },
  });
  return {
    document: documentStub,
    values,
    restore: () => {
      restoreGlobal('document', previousDocument);
      restoreGlobal('localStorage', previousStorage);
    },
  };
}

afterEach(async () => {
  mock.restoreAll();
  await resetClient();
});

test('public and current account records with the same id remain separate cache entities', () => {
  const client = getClient();
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
  const browser = installBrowserStorage();
  const oldClient = getClient();
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
  const newClient = getClient();
  assert.equal(newClient, oldClient);
  assert.equal(requestSignal?.aborted, true);
  assert.deepEqual(oldClient.cache.extract(), {});
  assert.deepEqual(newClient.cache.extract(), {});

  fetchResponse.resolve(Response.json({ data: { teamRecords: [] } }));
  await pending;
  assert.deepEqual(newClient.cache.extract(), {});
  browser.restore();
});
