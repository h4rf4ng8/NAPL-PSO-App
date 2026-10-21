import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import React, { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApolloProvider } from '@apollo/client/react';
import { client, resetClient } from '../src/api/client';
import { TeamRecordsDocument } from '../src/api/generated/graphql';
import { PublicLeague } from '../src/features/dashboard/PublicLeague';
import { ScheduleView } from '../src/features/matches/schedule-view';
import type { Account } from '../src/features/accounts/models';
import type { Team } from '../src/features/teams/models';

const events = new EventTarget();
const globals = {
  React,
  location: new URL('http://localhost:5173'),
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
};
const originalGlobals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
before(() => {
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
});
after(() => {
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
/* eslint-disable unicorn/no-top-level-assignment-in-function -- The mounted test tree is shared with the cleanup hook. */
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  mock.restoreAll();
  await resetClient();
  globals.location.hash = '';
});

const stats = { games: 1, wins: 1, draws: 0, losses: 0, goals: 1, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 };
const player: Account = {
  id: 'p1', username: 'Public Player', position: 'ST', teamId: 't1', imageUrl: null, country: null,
  stats, seasonStats: { all: stats, S1: stats }, ranking: { score: 0, percentile: 0, ranked: false, gamesPlayed: 1, tier: 'BRONZE' },
  cardStats: [], awards: [], championships: [], totwUntil: null, cheater: false, strikersId: '1', steamUrl: null, createdAt: 1,
};
const team: Team = {
  id: 't1', name: 'Public Team', tag: 'PUB', color: '#123456', description: '', ownerUsername: player.username,
  members: [player.username], invitations: [], pendingMembers: [], totw: false, totwSetAt: null, seasons: ['S1'],
  formation: '2-1-2', lineup: {}, status: 'approved', logoUrl: null, createdAt: 1,
  reviewedAt: null, reviewedBy: null, rejectionReason: null,
};
const responses: Record<string, unknown> = {
  '/api/accounts': [player],
  '/api/teams': [team],
  '/api/schedule': [{ id: 'm1', season: 'S1', week: 1, homeTeamId: 't1', awayTeamId: 't2', scheduledDate: null,
    streamUrl: '', matchType: 'league', playoffRound: null, status: 'scheduled', homeScore: null, awayScore: null,
    linkedMatchId: null, notes: 'Public fixture', createdAt: 1, updatedAt: 1 }],
  '/api/news': [],
  '/api/transfers': [],
  '/api/rules': [{ id: 'r1', title: 'Public rules', body: 'Play fairly.', sortOrder: 0, updatedAt: 1 }],
  '/api/articles': [],
};

function mockPublicReads() {
  return mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace('http://api.example.test','');
    assert.equal(init?.method, 'GET');
    assert.ok(Object.hasOwn(responses, path), `Unexpected public request: ${path}`);
    return Response.json(responses[path]);
  });
}

const renderedText = () => renderer!.root.findAll(node => typeof node.type === 'string')
  .flatMap(node => node.children.filter(child => typeof child === 'string')).join(' ');

test('visitors can browse every public page without standings navigation or private queries', async () => {
  const fetch = mockPublicReads();
  await act(async () => {
    renderer = create(createElement(ApolloProvider, { client }, createElement(PublicLeague, { onLogin() {} })));
  });
  const navigation = () => renderer!.root.findByType('nav').findAllByType('button');
  assert.deepEqual(navigation().map(button => button.children.join('')), ['teams', 'stats', 'schedule', 'news', 'transfers', 'rules']);
  assert.match(navigation()[0]!.props.className, /active/);
  assert.match(renderedText(), /Public Team/);
  assert.deepEqual(new Set(fetch.mock.calls.map(call => String(call.arguments[0]).replace('http://api.example.test',''))), new Set(['/api/accounts', '/api/teams']));

  for (const [page, expected] of [
    ['stats', /Public Player/], ['schedule', /SCHEDULED/], ['news', /MATCHUPS/],
    ['transfers', /TRANSFER MARKET/], ['rules', /Play fairly/], ['teams', /Public Team/],
  ] as const) {
    await act(async () => { navigation().find(button => button.children.join('') === page)!.props.onClick(); });
    assert.match(renderedText(), expected);
    assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0, page);
  }
  await act(async () => { navigation().find(button => button.children.join('') === 'news')!.props.onClick(); });
  await act(async () => { renderer!.root.findAllByType('button').find(button => button.children.join('') === 'ARTICLES')!.props.onClick(); });
  assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
  const paths = new Set(fetch.mock.calls.map(call => String(call.arguments[0]).replace('http://api.example.test','')));
  assert.ok(paths.has('/api/schedule'));
  assert.ok(paths.has('/api/news'));
  assert.ok(paths.has('/api/transfers'));
  assert.ok(paths.has('/api/rules'));
  assert.ok(paths.has('/api/articles'));
  assert.ok(!paths.has('/api/standings'));
  assert.ok(!paths.has('/api/team-records'));
});

test('public schedule skips team records and hides data retained after its account changes', async () => {
  const fetch = mockPublicReads();
  client.cache.writeQuery({ query: TeamRecordsDocument, data: { teamRecords: [
    { teamId: 't1', season: 'all', w: 91, d: 8, l: 7, played: 106, gf: 200, ga: 50, gd: 150, pts: 281 },
  ] } });
  const schedule = (account: Account | null) => createElement(ApolloProvider, { client }, createElement(ScheduleView, { account }));
  await act(async () => { renderer = create(schedule(player)); });
  assert.match(renderedText(), /91W-8D-7L/);
  await act(async () => { renderer!.update(schedule(null)); });
  assert.match(renderedText(), /SCHEDULED/);
  assert.doesNotMatch(renderedText(), /91W-8D-7L/);
  assert.equal(renderer!.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.deepEqual(new Set(fetch.mock.calls.map(call => String(call.arguments[0]).replace('http://api.example.test',''))), new Set(['/api/schedule', '/api/teams']));
});
