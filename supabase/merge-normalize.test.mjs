import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legacyTables, normalizeLegacy } from './merge-normalize.mjs';

const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const periodId = '33333333-3333-4333-8333-333333333333', voteId = '44444444-4444-4444-8444-444444444444';
function fixture() {
  const tables = Object.fromEntries(legacyTables.map(table => [table, []]));
  tables.accounts = [{ id: alice, username: 'Alice', username_lower: 'forged', position: 'LB', team_id: 'A', stats: { games: 10, goals: 2 }, matches: [{ id: 'm', season: 'S2', goals: 2 }], privileged: true },
    { id: bob, username: 'Bob', position: 'ST', team_id: null, stats: {}, matches: [{}] }];
  tables.teams = [{ id: 'A', owner_username: 'OldAlice', reviewed_by: 'unknown', seasons: ['S1'], pending_members: [{ username: 'Bob', status: 'declined', respondedAt: 123, note: 'retained' }] }];
  tables.settings = [{ key: 'current_season', value: 'S2' }, { key: 'position_weights', value: '{}' }, { key: 'admin_list', value: '["Bob"]' }, { key: 'discord_webhook', value: 'secret' }];
  tables.scheduled_matches = [{ id: 'schedule', season: 'S2', home_team_id: 'A', away_team_id: 'A' }];
  tables.submissions = [{ id: 'submission', submitted_by: 'OldAlice', reviewed_by: 'unknown', match_info: { homeTeamId: 'A', awayTeamId: 'A' }, player_stats: [], edits: [] }];
  tables.news = [{ id: 'news', auto_from_submission: 'submission' }];
  tables.position_change_requests = [{ id: voteId, account_id: alice, username: 'OldAlice', reviewed_by: 'Bob' }];
  tables.totw_voting_periods = [{ id: periodId, created_by: 'OldAlice', eligible_players: ['OldAlice'], winners: { st1: { username: 'Bob', votes: 3 } } }];
  tables.totw_votes = [{ id: voteId, period_id: periodId, voter_username: 'OldAlice', position: 'ST', voted_for_username: 'Bob', voted_at: new Date(0) }];
  tables.transfers = [{ id: 'transfer', season: 'S2', player_username: 'OldAlice', from_team_id: null, to_team_id: 'A', created_by: 'Bob' }];
  tables.articles = [{ id: 'article', body: '<script>literal historical text</script>', extra: 'not a column' }];
  tables.rules_sections = [{ id: 'rules', body: 'Rules' }];
  const manifest = { account_aliases: { OldAlice: alice }, excluded_team_ids: ['excluded'], excluded_vote_ids: [] };
  return { tables, manifest };
}

test('normalization preserves legacy payloads and UUID aliases while stripping authority and generated columns', () => {
  const { tables: source, manifest } = fixture(), original = structuredClone(source);
  const result = normalizeLegacy(source, manifest), { tables } = result;
  assert.deepEqual(result.errors, []);
  assert.deepEqual(source, original);
  assert.equal(Object.keys(tables).length, 17);
  assert.deepEqual(tables.accounts[0].stats, { games: 10, goals: 2 });
  assert.equal(tables.accounts[0].username_lower, undefined);
  assert.equal(tables.accounts[0].privileged, undefined);
  assert.deepEqual(tables.settings.map(row => row.key), ['current_season', 'position_weights']);
  assert.equal(tables.teams[0].owner_account_id, alice);
  assert.equal(tables.teams[0].reviewed_by_account_id, null);
  assert.equal(tables.submissions[0].submitted_by_account_id, alice);
  assert.equal(tables.position_change_requests[0].reviewed_by_account_id, bob);
  assert.equal(tables.transfers[0].player_username_snapshot, 'OldAlice');
  assert.equal(tables.transfers[0].player_account_id, alice);
  assert.equal(tables.scheduled_matches[0].season_id, 'S2');
  assert.equal(tables.scheduled_matches[0].season, undefined);
  assert.deepEqual(tables.seasons, [{ id: 'S1' }, { id: 'S2' }]);
  assert.deepEqual(tables.team_seasons, [{ team_id: 'A', season_id: 'S2' }]);
  assert.deepEqual(tables.team_join_requests[0].details, source.teams[0].pending_members[0]);
  assert.equal(tables.team_join_requests[0].reviewed_at, '1970-01-01T00:00:00.123Z');
  assert.equal(tables.totw_candidates.find(row => row.account_id === alice).position, 'DEF');
  assert.deepEqual(tables.totw_winners[0].details, { key: 'st1', value: { username: 'Bob', votes: 3 } });
  assert.equal(tables.totw_votes[0].voter_account_id, alice);
  assert.equal(tables.articles[0].body, source.articles[0].body);
  assert.equal(tables.articles[0].extra, undefined);
});

test('request IDs and output remain deterministic across top-level input order and verified aliases', () => {
  const { tables, manifest } = fixture();
  const first = normalizeLegacy(tables, manifest);
  for (const rows of Object.values(tables)) rows.reverse();
  assert.deepEqual(normalizeLegacy(tables, manifest), first);
  tables.teams[0].pending_members[0].username = 'OldBob';
  manifest.account_aliases.OldBob = bob;
  assert.equal(normalizeLegacy(tables, manifest).tables.team_join_requests[0].id, first.tables.team_join_requests[0].id);
  assert.match(first.tables.team_join_requests[0].id, /^[\da-f]{8}-[\da-f]{4}-8[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
});

test('reviewed exclusions and unresolved parents hold dependent rows without importing security settings', () => {
  const { tables, manifest } = fixture();
  manifest.excluded_vote_ids.push(voteId);
  tables.teams[0].id = 'excluded';
  tables.accounts[0].team_id = 'excluded';
  tables.submissions[0].match_info.homeTeamId = 'excluded';
  const result = normalizeLegacy(tables, manifest);
  for (const table of ['teams', 'team_join_requests', 'team_seasons', 'scheduled_matches', 'submissions', 'news', 'position_change_requests', 'transfers', 'totw_votes', 'totw_winners']) assert.equal(result.tables[table].length, 0, table);
  assert.equal(result.tables.accounts.length, 1);
  assert.ok(result.holds.some(row => row.table === 'totw_votes' && row.reason === 'reviewed_exclusion'));
  assert.ok(result.holds.some(row => row.table === 'news' && row.reason === 'unresolved_reference:auto_from_submission'));
  assert.deepEqual(result.errors, []);
});

test('ambiguous keys, unresolved identities and malformed containers are held or rejected explicitly', () => {
  const { tables, manifest } = fixture();
  tables.teams[0].pending_members.push({ username: 'missing' });
  tables.totw_votes.push({ ...tables.totw_votes[0], id: '55555555-5555-4555-8555-555555555555' });
  tables.transfers[0].player_username = 'missing';
  const result = normalizeLegacy(tables, manifest);
  assert.equal(result.tables.totw_votes.length, 0);
  assert.equal(result.tables.transfers.length, 0);
  assert.ok(result.holds.some(row => row.reason === 'unresolved_invitee'));
  assert.ok(result.holds.some(row => row.reason === 'missing_or_duplicate_key'));
  manifest.account_aliases.Alice = bob;
  assert.equal(normalizeLegacy(tables, manifest).errors[0].reason, 'invalid_account_alias');
  delete tables.news;
  assert.equal(normalizeLegacy(tables, manifest).errors[0].reason, 'expected_row_array');
});

test('holding an account also holds optional actor references and their dependents', () => {
  const { tables, manifest } = fixture();
  tables.accounts[1].matches = null;
  tables.teams[0].reviewed_by = 'Bob';
  const result = normalizeLegacy(tables, manifest);
  assert.ok(result.holds.some(row => row.table === 'teams' && row.reason === 'unresolved_reference:reviewed_by_account_id'));
  assert.ok(result.holds.some(row => row.table === 'accounts' && row.reason === 'unresolved_reference:team_id'));
  assert.equal(result.tables.submissions.length, 0);
  assert.equal(result.tables.totw_voting_periods.length, 0);
  assert.equal(result.tables.totw_candidates.length, 0);
  assert.equal(result.tables.totw_winners.length, 0);
  assert.equal(result.tables.totw_votes.length, 0);
});
