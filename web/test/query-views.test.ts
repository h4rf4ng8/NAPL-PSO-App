import assert from 'node:assert/strict';
import { after, afterEach, mock, test } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApolloProvider } from '@apollo/client/react';
import { client, resetClient } from '../src/api/client';
import { AccountMatchesDocument } from '../src/api/generated/graphql';
import { MatchLog } from '../src/features/dashboard/MatchLog';
import type { Account } from '../src/features/accounts/models';

// The standalone tsx runner uses classic JSX; the app build uses automatic JSX.
Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
after(() => { Reflect.deleteProperty(globalThis, 'React'); });
afterEach(async () => { mock.restoreAll(); await resetClient(); });

const account = { id: 'p1' } as Account;

test('match log renders its cached filtered page through Apollo hooks', () => {
  const fetch = mock.method(globalThis, 'fetch');
  client.cache.writeQuery({
    query: AccountMatchesDocument,
    variables: { id: 'p1', first: 25, after: null, season: 'S2', opponent: null },
    data: { accountMatches: {
      __typename: 'AccountMatchPage',
      nodes: [{ id: 'm1', date: 1, season: 'S2', opponent: 'Blue', result: 'W', goals: 2, assists: 0,
        passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: false, motm: false }],
      pageInfo: { __typename: 'AccountMatchPageInfo', endCursor: 'next', hasNextPage: true },
    } },
  });
  const html = renderToStaticMarkup(createElement(ApolloProvider, { client },
    createElement(MatchLog, { account, season: 'S2' })));
  assert.match(html, /VS BLUE/);
  assert.doesNotMatch(html, /Loading match history/);
  assert.equal(fetch.mock.callCount(), 0);
});
