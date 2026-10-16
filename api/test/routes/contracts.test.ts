import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as contracts from '../../../pkgs/contracts/src/index.js';

const matchInfo = { homeTeamId: 'home', awayTeamId: 'away', homeScore: 0, awayScore: 1000, date: 0, season: 'S1' };
const playerStat = { username: 'Alice', position: 'ST' };
const submission = { matchInfo, playerStats: [playerStat] };
const schedule = { id: 'match', season: 'S1', week: 1, homeTeamId: 'home', awayTeamId: 'away' };

test('request contracts reject extra fields, including schemas derived with omit, partial, and extend', () => {
  const inputs = {
    profilePatch: {}, adminAccountPatch: { cheater: false }, playerStat,
    submissionInput: { id: 'submission', ...submission }, approveSubmission: submission,
    teamInput: { id: 'team', name: 'Team', tag: 'FC' }, teamPatch: { totw: false },
    newsInput: { id: 'news', type: 'announcement' }, ruleInput: { id: 'rule', title: 'Rule' },
    articleInput: { id: 'article', slug: 'news', title: 'News' }, scheduleInput: schedule,
    transferInput: { season: 'S1', playerUsername: 'Alice', kind: 'signing' },
    periodInput: { closesAt: 0, eligiblePlayers: ['Alice'] }, periodPatch: { status: 'closed' },
    voteInput: { gk: 'Alice', def: 'Alice', cm: 'Alice', st: 'Alice' },
  };
  for (const name of Object.keys(inputs) as (keyof typeof inputs)[]) {
    const schema = contracts[name];
    assert.equal(schema.safeParse(inputs[name]).success, true, name);
    const result = schema.safeParse({ ...inputs[name], unexpected: 'value' });
    assert.equal(result.success, false, name);
    assert.deepEqual(result.error?.issues.map(({ code, path }) => ({ code, path })), [{ code: 'unrecognized_keys', path: [] }], name);
  }
  assert.equal(contracts.approveSubmission.safeParse({ ...submission, id: 'submission' }).success, false);
  assert.equal(contracts.teamPatch.safeParse({ pendingMembers: ['Alice'] }).success, false);
});

test('historical match, award, and championship records retain extra metadata', () => {
  const inputs = {
    matchInfo,
    matchSchema: {
      id: 'match', date: 0, season: 'S1', opponent: 'Team', result: 'W', goals: 1, assists: 0,
      passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: false, motm: true,
    },
    awardSchema: { awardId: 'legacy-award', season: 'S1' },
    championshipSchema: { season: 'S1', placement: '1st', teamId: 'team', awardedAt: 0 },
  };
  for (const name of Object.keys(inputs) as (keyof typeof inputs)[]) {
    const input = { ...inputs[name], legacyMetadata: { source: 'historical-import' } };
    assert.deepEqual(contracts[name].parse(input), input, name);
  }
  assert.equal(contracts.matchSchema.parse({ ...inputs.matchSchema, strikersMatchId: 123 }).strikersMatchId, '123');
});

test('stats reject non-finite values while retaining finite extension fields', () => {
  const stats = Object.fromEntries(Object.keys(contracts.accountStatsSchema.shape).map(key => [key, 0]));
  assert.deepEqual(contracts.accountStatsSchema.parse({ ...stats, legacyStat: 0.5 }), { ...stats, legacyStat: 0.5 });
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(contracts.stats.safeParse({ goals: value }).success, false);
    assert.equal(contracts.accountStatsSchema.safeParse({ ...stats, goals: value }).success, false);
    assert.equal(contracts.accountStatsSchema.safeParse({ ...stats, legacyStat: value }).success, false);
  }
});

test('score and schedule integers retain bounds and request defaults', () => {
  assert.deepEqual(contracts.matchInfo.parse(matchInfo), matchInfo);
  for (const homeScore of [-1, 0.5, 1001, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(contracts.matchInfo.safeParse({ ...matchInfo, homeScore }).success, false);
  for (const week of [1, 10_000]) assert.equal(contracts.scheduleInput.parse({ ...schedule, week }).week, week);
  for (const week of [0, 1.5, 10_001]) assert.equal(contracts.scheduleInput.safeParse({ ...schedule, week }).success, false);
  assert.equal(contracts.newsInput.parse({ id: 'news', type: 'result', homeScore: Number.MAX_SAFE_INTEGER }).homeScore, Number.MAX_SAFE_INTEGER);
  assert.equal(contracts.newsInput.safeParse({ id: 'news', type: 'result', homeScore: Number.MAX_SAFE_INTEGER + 1 }).success, false);
  assert.deepEqual(contracts.ruleInput.parse({ id: 'rule', title: 'Rule' }), { id: 'rule', title: 'Rule', body: '', sortOrder: 0 });
  assert.deepEqual(contracts.playerStat.parse(playerStat), {
    ...playerStat, goals: 0, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: false,
  });
});
