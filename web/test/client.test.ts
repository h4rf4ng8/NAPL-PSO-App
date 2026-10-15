import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { gql } from '@apollo/client';
import { getClient, resetClient } from '../src/api/client';

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

afterEach(() => {
  mock.restoreAll();
  resetClient();
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

test('resetClient aborts old requests, clears both caches and ignores a late old response', async () => {
  const browser = installBrowserStorage();
  const oldClient = getClient();
  const fetchResponse = Promise.withResolvers<Response>();
  let requestSignal: AbortSignal | undefined;
  mock.method(globalThis, 'fetch', (_url: string | URL | Request, init?: RequestInit) => {
    requestSignal = init?.signal;
    return fetchResponse.promise;
  });
  const query = gql`query SlowAccounts { accounts { __typename id username } }`;
  oldClient.cache.writeQuery({ query, data: {
    accounts: [{ __typename: 'Account', id: 'cached-id', username: 'old-session' }],
  } });
  assert.equal(oldClient.cache.extract()['Account:cached-id']?.username, 'old-session');
  const pending = (async () => {
    try {
      await oldClient.query({ query, fetchPolicy: 'network-only' });
    }
    catch { /* Client reset cancels this request. */ }
  })();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(requestSignal, 'request should have started');

  resetClient();
  const newClient = getClient();
  assert.equal(requestSignal?.aborted, true);
  assert.deepEqual(oldClient.cache.extract(), {});
  assert.deepEqual(newClient.cache.extract(), {});

  fetchResponse.resolve(Response.json({ data: { accounts: [
    { __typename: 'Account', id: 'late-id', username: 'old-session' },
  ] } }));
  await pending;
  assert.deepEqual(newClient.cache.extract(), {});
  browser.restore();
});
