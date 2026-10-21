import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, resetCsrf } from '../src/api/http';
import { accounts } from '../src/features/accounts/api';
import { settings } from '../src/features/admin/api';
import { content } from '../src/features/content/api';
import { matches } from '../src/features/matches/api';
import { teams } from '../src/features/teams/api';
import { voting } from '../src/features/voting/api';

Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'napl-csrf=test' } });
afterEach(() => { mock.restoreAll(); resetCsrf(); });

function captureCommands() {
  const calls: { url: string; method: string | undefined; body: unknown }[] = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: JSON.parse(String(options?.body)) });
    return new Response(null, { status: 204 });
  });
  return calls;
}

test('position and voting commands leave actor identity to the server', async () => {
  const calls = captureCommands();
  const position = { toPos: 'GK', reason: 'Better fit', accountId: 'other', username: 'other', fromPos: 'ST' };
  const period = { closesAt: 100, eligiblePlayers: ['one'], createdBy: 'other' };
  await accounts.createPositionRequest(position);
  await accounts.approvePositionRequest('request/1');
  await accounts.denyPositionRequest('request/2', 'Try next season');
  await voting.createTotwPeriod(period);
  assert.deepEqual(calls, [
    { url: '/api/position-requests', method: 'POST', body: { toPos: 'GK', reason: 'Better fit' } },
    { url: '/api/position-requests/request%2F1/review', method: 'POST', body: { status: 'approved', reviewNote: '' } },
    { url: '/api/position-requests/request%2F2/review', method: 'POST', body: { status: 'denied', reviewNote: 'Try next season' } },
    { url: '/api/voting/periods', method: 'POST', body: { closesAt: 100, eligiblePlayers: ['one'] } },
  ]);
});

test('save commands preserve editable fields without sending stored metadata', async () => {
  const calls = captureCommands();
  const team = { id: 'team', name: 'Team', tag: 'TAG', color: '#fff', description: '', logoUrl: null, seasons: [],
    ownerUsername: 'other', members: ['other'], status: 'approved', createdAt: 10 };
  const article = { id: 'article', slug: 'story', title: 'Story', coverImageUrl: '', body: 'Body', excerpt: 'Preview',
    publishedAt: 20, author: 'other', updatedAt: 30 };
  await teams.createTeam(team);
  await teams.saveTeam(team);
  await content.saveArticle(article);
  const teamBody = { id: 'team', name: 'Team', tag: 'TAG', color: '#fff', description: '', logoUrl: null, seasons: [] };
  assert.deepEqual(calls, [
    { url: '/api/teams', method: 'POST', body: teamBody },
    { url: '/api/teams/team', method: 'PATCH', body: { name: 'Team', tag: 'TAG', color: '#fff', description: '', logoUrl: null, seasons: [] } },
    { url: '/api/articles', method: 'POST', body: { id: 'article', slug: 'story', title: 'Story', coverImageUrl: null, body: 'Body', excerpt: 'Preview', publishedAt: 20 } },
  ]);
});

test('replacing a season sends one command with the URL as its season source', async () => {
  const calls = captureCommands();
  const row = { id: 'match', week: 1, homeTeamId: 'home', awayTeamId: 'away', season: 'wrong', createdAt: 10, updatedAt: 20 };
  await matches.replaceScheduledSeason('S1/playoffs', [row]);
  assert.deepEqual(calls, [{ url: '/api/schedule/season/S1%2Fplayoffs', method: 'PUT', body: {
    matches: [{ id: 'match', week: 1, homeTeamId: 'home', awayTeamId: 'away' }],
  } }]);
});

test('vote commands resolve on success and reject server errors', async () => {
  const calls = captureCommands();
  const votes = { gk: 'Keeper', def: 'Defender', cm: 'Midfielder', st: 'Striker' };
  assert.equal(await voting.submitTotwVotes('period/1', votes), undefined);
  assert.deepEqual(calls, [
    { url: '/api/voting/periods/period%2F1/votes', method: 'PUT', body: votes },
  ]);
  mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'conflict', message: 'Try again.' } }, { status: 409 }));
  await assert.rejects(voting.submitTotwVotes('period/1', votes), error => error instanceof ApiError && error.status === 409 && error.code === 'conflict' && error.message === 'Try again.');
});

test('award commands use stable identities, accept 204 and surface conflicts without replay', async () => {
  const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: options?.body });
    return new Response(null, { status: 204 });
  });
  assert.equal(await accounts.assignAward('account/1', 'glove', 'S1/playoffs'), undefined);
  assert.equal(await accounts.removeAward('account/1', 'legacy/award', 'S1/playoffs'), undefined);
  assert.deepEqual(calls, [
    { url: '/api/accounts/account%2F1/awards/glove/S1%2Fplayoffs', method: 'PUT', body: undefined },
    { url: '/api/accounts/account%2F1/awards/legacy%2Faward/S1%2Fplayoffs', method: 'DELETE', body: undefined },
  ]);
  let attempts = 0;
  mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return Response.json({ error: 'concurrent_update', message: 'Retry the command.' }, { status: 409 });
  });
  for (const command of [() => accounts.assignAward('account', 'glove', 'S1'), () => accounts.removeAward('account', 'glove', 'S1')]) {
    await assert.rejects(command(), error => error instanceof ApiError && error.status === 409);
  }
  assert.equal(attempts, 2);
});

test('administrator reads return roles and propagate authorization failures', async () => {
  const roles = [{ userId: 'admin-id', username: 'Admin', role: 'admin' }];
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), '/api/roles');
    assert.equal(options?.method, 'GET');
    return Response.json(roles);
  });
  assert.deepEqual(await settings.getAdminList(), roles);
  mock.method(globalThis, 'fetch', async () => Response.json({ error: 'super_admin_required' }, { status: 403 }));
  await assert.rejects(settings.getAdminList(), error => error instanceof ApiError && error.status === 403 && error.code === 'super_admin_required');
});
