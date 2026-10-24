import { createHash } from 'node:crypto';

export const legacyTables = ['accounts', 'teams', 'articles', 'rules_sections', 'settings', 'scheduled_matches', 'submissions', 'news', 'position_change_requests', 'totw_voting_periods', 'totw_votes', 'transfers'];

export const tableKeys = {
  accounts: ['id'], teams: ['id'], team_join_requests: ['id'], seasons: ['id'],
  team_seasons: ['team_id', 'season_id'], articles: ['id'], rules_sections: ['id'], settings: ['key'],
  scheduled_matches: ['id'], submissions: ['id'], news: ['id'], position_change_requests: ['id'],
  totw_voting_periods: ['id'], totw_candidates: ['period_id', 'account_id', 'position'],
  totw_winners: ['period_id', 'account_id', 'position'], totw_votes: ['id'], transfers: ['id'],
};

// Explicit columns prevent extra source columns from becoming authority or executable schema.
const columns = {
  accounts: 'id username position team_id image_url pending_image_url email country stats matches awards championships totw_until cheater created_at strikers_id steam_url',
  teams: 'id name tag color description owner_account_id totw totw_set_at status logo_url created_at reviewed_at reviewed_by reviewed_by_account_id rejection_reason lineup formation',
  articles: 'id slug title cover_image_url author body excerpt published_at updated_at',
  rules_sections: 'id title body sort_order created_at updated_at',
  settings: 'key value',
  scheduled_matches: 'id season_id week home_team_id away_team_id scheduled_date stream_url match_type playoff_round status home_score away_score linked_match_id notes created_at updated_at',
  submissions: 'id status submitted_by submitted_by_account_id submitted_at reviewed_by reviewed_by_account_id reviewed_at rejection_reason match_info player_stats edits',
  news: 'id type title body pinned home_team_id away_team_id home_score away_score event_date notes author created_at auto_from_submission',
  position_change_requests: 'id account_id username from_pos to_pos reason status reviewed_by reviewed_by_account_id reviewed_at review_note created_at',
  totw_voting_periods: 'id opens_at closes_at status created_by created_by_account_id created_at resolved_at',
  transfers: 'id season_id player_account_id player_username_snapshot from_team_id to_team_id kind window_type created_at created_by created_by_account_id',
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const name = value => typeof value === 'string' ? value.toLowerCase() : '';
const key = (row, fields) => JSON.stringify(fields.map(field => row[field]));
const identifier = (table, row) => tableKeys[table].length === 1 ? String(row[tableKeys[table][0]]) : key(row, tableKeys[table]);
const uuid = value => typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
const select = (table, row) => Object.fromEntries(columns[table].split(' ').filter(column => Object.hasOwn(row, column)).map(column => [column, structuredClone(row[column])]));

function requestId(team, account, occurrence) {
  const bytes = createHash('sha256').update(JSON.stringify(['asl-legacy-request', team, account, occurrence])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0F) | 0x80;
  bytes[8] = (bytes[8] & 0x3F) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Pure legacy-to-asl projection; semantic/content review and destination conflicts belong to the caller.
export function normalizeLegacy(input, manifest) {
  const tables = Object.fromEntries(Object.keys(tableKeys).map(table => [table, []]));
  const holds = [], errors = [];
  const result = { tables, holds, errors };
  if (!object(input) || !object(manifest) || !object(manifest.account_aliases)
    || !Array.isArray(manifest.excluded_team_ids) || manifest.excluded_team_ids.some(id => typeof id !== 'string')
    || !Array.isArray(manifest.excluded_vote_ids) || manifest.excluded_vote_ids.some(id => !uuid(id))) {
    errors.push({ table: 'manifest', id: '', reason: 'invalid_normalization_input' });
    return result;
  }
  for (const table of legacyTables) {
    if (!Array.isArray(input[table]) || input[table].some(row => !object(row))) errors.push({ table, id: '', reason: 'expected_row_array' });
  }
  if (errors.length > 0) return result;
  const hold = (table, row, reason) => { holds.push({ table, id: identifier(table, row), reason }); };
  const excludedTeams = new Set(manifest.excluded_team_ids), excludedVotes = new Set(manifest.excluded_vote_ids);
  const accounts = new Map(input.accounts.map(row => [row.id, row]));
  const aliases = new Map();
  for (const account of input.accounts) {
    if (!uuid(account.id) || !name(account.username)) errors.push({ table: 'accounts', id: String(account.id), reason: 'invalid_account_identity' });
    if (aliases.has(name(account.username)) && aliases.get(name(account.username)) !== account.id) errors.push({ table: 'accounts', id: String(account.id), reason: 'duplicate_username' });
    aliases.set(name(account.username), account.id);
  }
  for (const [alias, accountId] of Object.entries(manifest.account_aliases)) {
    if (!name(alias) || !uuid(accountId) || !accounts.has(accountId) || (aliases.has(name(alias)) && aliases.get(name(alias)) !== accountId)) {
      errors.push({ table: 'manifest', id: alias, reason: 'invalid_account_alias' });
    } else aliases.set(name(alias), accountId);
  }
  if (errors.length > 0) return result;
  const resolve = username => aliases.get(name(username)) ?? null;
  const blockedTeam = (...ids) => ids.some(id => id != null && excludedTeams.has(id));
  const add = (table, row) => { tables[table].push(select(table, row)); };

  for (const account of input.accounts) {
    if (blockedTeam(account.team_id)) hold('accounts', account, 'excluded_team_reference');
    else add('accounts', account);
  }
  const sourceTeams = [];
  for (const team of input.teams) {
    if (excludedTeams.has(team.id)) { hold('teams', team, 'reviewed_exclusion'); continue; }
    const owner = resolve(team.owner_username);
    if (!owner) { hold('teams', team, 'unresolved_owner'); continue; }
    if (!Array.isArray(team.pending_members) || (team.seasons != null && (!Array.isArray(team.seasons) || team.seasons.some(value => typeof value !== 'string')))) {
      hold('teams', team, 'invalid_legacy_team_arrays'); continue;
    }
    add('teams', { ...team, owner_account_id: owner, reviewed_by_account_id: resolve(team.reviewed_by) });
    sourceTeams.push(team);
    const occurrences = new Map();
    for (const [index, entry] of team.pending_members.entries()) {
      const details = typeof entry === 'string' ? { username: entry } : entry;
      const accountId = object(details) ? resolve(details.username) : null;
      const held = { id: `${team.id}:${index + 1}` };
      if (!accountId) { hold('team_join_requests', held, 'unresolved_invitee'); continue; }
      const occurrence = (occurrences.get(accountId) ?? 0) + 1;
      occurrences.set(accountId, occurrence);
      let reviewedAt = null;
      if (typeof details.respondedAt === 'number' || (typeof details.respondedAt === 'string' && details.respondedAt !== '')) {
        const date = new Date(details.respondedAt);
        if (!Number.isFinite(date.getTime())) { hold('team_join_requests', held, 'invalid_response_date'); continue; }
        reviewedAt = date.toISOString();
      }
      tables.team_join_requests.push({ id: requestId(team.id, accountId, occurrence), team_id: team.id, account_id: accountId,
        status: details.status ?? 'pending', reviewed_at: reviewedAt, details: structuredClone(details) });
    }
  }
  for (const table of ['articles', 'rules_sections']) {
    const rows = input[table];
    for (const row of rows) add(table, row);
  }
  for (const row of input.settings) {
    if (['current_season', 'season_champions', 'position_weights'].includes(row.key)) add('settings', row);
    else hold('settings', row, 'setting_not_allowlisted');
  }
  for (const row of input.submissions) {
    if (!object(row.match_info)) { hold('submissions', row, 'invalid_match_info'); continue; }
    if (blockedTeam(row.match_info.homeTeamId, row.match_info.awayTeamId)) { hold('submissions', row, 'excluded_team_reference'); continue; }
    add('submissions', { ...row, submitted_by_account_id: resolve(row.submitted_by), reviewed_by_account_id: resolve(row.reviewed_by) });
  }
  for (const row of input.news) {
    if (blockedTeam(row.home_team_id, row.away_team_id)) hold('news', row, 'excluded_team_reference');
    else add('news', row);
  }
  for (const row of input.position_change_requests) add('position_change_requests', { ...row, reviewed_by_account_id: resolve(row.reviewed_by) });
  for (const row of input.scheduled_matches) {
    if (blockedTeam(row.home_team_id, row.away_team_id)) hold('scheduled_matches', row, 'excluded_team_reference');
    else add('scheduled_matches', { ...row, season_id: row.season });
  }
  for (const row of input.transfers) {
    const player = resolve(row.player_username);
    if (blockedTeam(row.from_team_id, row.to_team_id)) hold('transfers', row, 'excluded_team_reference');
    else if (player) add('transfers', { ...row, season_id: row.season, player_account_id: player, player_username_snapshot: row.player_username, created_by_account_id: resolve(row.created_by) });
    else hold('transfers', row, 'unresolved_player');
  }

  for (const period of input.totw_voting_periods) {
    if (!Array.isArray(period.eligible_players) || (period.winners != null && !object(period.winners))) { hold('totw_voting_periods', period, 'invalid_voting_json'); continue; }
    add('totw_voting_periods', { ...period, created_by_account_id: resolve(period.created_by) });
    for (const [index, entry] of period.eligible_players.entries()) {
      const accountId = resolve(typeof entry === 'string' ? entry : entry?.username);
      if (!accountId) { hold('totw_candidates', { period_id: period.id, account_id: null, position: index + 1 }, 'unresolved_candidate'); continue; }
      const position = accounts.get(accountId).position;
      tables.totw_candidates.push({ period_id: period.id, account_id: accountId, position: ['CB', 'LB', 'RB', 'DEF'].includes(position) ? 'DEF' : position,
        details: { legacyEligiblePlayer: structuredClone(entry), legacyOrdinal: index + 1 } });
    }
    const winners = Object.entries(period.winners ?? {});
    for (const [slot, value] of winners) {
      const position = ({ gk: 'GK', def1: 'DEF', def2: 'DEF', cm: 'CM', st: 'ST', st1: 'ST', st2: 'ST' })[slot.toLowerCase()] ?? slot.toUpperCase();
      const accountId = resolve(typeof value === 'string' ? value : value?.username);
      const row = { period_id: period.id, account_id: accountId, position, details: { key: slot, value: structuredClone(value) } };
      if (accountId) tables.totw_winners.push(row);
      else hold('totw_winners', row, 'unresolved_winner');
    }
  }
  for (const vote of input.totw_votes) {
    if (excludedVotes.has(vote.id)) { hold('totw_votes', vote, 'reviewed_exclusion'); continue; }
    const voter = resolve(vote.voter_username), candidate = resolve(vote.voted_for_username);
    if (!voter || !candidate) { hold('totw_votes', vote, 'unresolved_vote_account'); continue; }
    tables.totw_votes.push({ id: vote.id, period_id: vote.period_id, voter_account_id: voter, position: vote.position, voted_for_account_id: candidate, voted_at: structuredClone(vote.voted_at) });
    if (tables.totw_candidates.every(row => !(row.period_id === vote.period_id && row.account_id === candidate && row.position === vote.position))) {
      tables.totw_candidates.push({ period_id: vote.period_id, account_id: candidate, position: vote.position, details: {} });
    }
  }

  const seasons = new Set();
  const season = value => { if (typeof value === 'string' && value !== '') seasons.add(value); };
  for (const table of ['scheduled_matches', 'transfers']) {
    const rows = tables[table];
    for (const row of rows) season(row.season_id);
  }
  for (const row of tables.settings) if (row.key === 'current_season') season(row.value);
  for (const team of sourceTeams) {
    const excluded = team.seasons ?? [];
    for (const value of excluded) season(value);
  }
  for (const account of tables.accounts) {
    if (!Array.isArray(account.matches)) { hold('accounts', account, 'invalid_match_array'); continue; }
    for (const match of account.matches) season(match?.season || 'S1');
  }
  tables.accounts = tables.accounts.filter(row => Array.isArray(row.matches));
  tables.seasons = [...seasons].map(id => ({ id }));
  for (const team of sourceTeams) for (const id of seasons) if (!(team.seasons ?? []).includes(id)) tables.team_seasons.push({ team_id: team.id, season_id: id });

  // Reject every member of an ambiguous key, rather than choosing whichever row arrived first.
  const unique = (table, fields) => {
    const counts = new Map();
    const rows = tables[table];
    for (const row of rows) counts.set(key(row, fields), (counts.get(key(row, fields)) ?? 0) + 1);
    tables[table] = rows.filter(row => {
      const valid = fields.every(field => row[field] != null) && counts.get(key(row, fields)) === 1;
      if (!valid) hold(table, row, 'missing_or_duplicate_key');
      return valid;
    });
  };
  for (const [table, fields] of Object.entries(tableKeys)) unique(table, fields);
  unique('totw_votes', ['period_id', 'voter_account_id', 'position']);
  const requests = tables.team_join_requests;
  tables.team_join_requests = requests.filter(row => row.status === 'pending');
  unique('team_join_requests', ['team_id', 'account_id']);
  tables.team_join_requests.push(...requests.filter(row => row.status !== 'pending'));

  const references = {
    accounts: [['team_id', 'teams', true]], teams: [['owner_account_id', 'accounts'], ['reviewed_by_account_id', 'accounts', true]],
    team_join_requests: [['team_id', 'teams'], ['account_id', 'accounts']], team_seasons: [['team_id', 'teams'], ['season_id', 'seasons']],
    scheduled_matches: [['home_team_id', 'teams'], ['away_team_id', 'teams'], ['season_id', 'seasons']],
    news: [['home_team_id', 'teams', true], ['away_team_id', 'teams', true], ['auto_from_submission', 'submissions', true]],
    submissions: [['submitted_by_account_id', 'accounts', true], ['reviewed_by_account_id', 'accounts', true]],
    position_change_requests: [['account_id', 'accounts'], ['reviewed_by_account_id', 'accounts', true]],
    transfers: [['player_account_id', 'accounts'], ['from_team_id', 'teams', true], ['to_team_id', 'teams', true], ['season_id', 'seasons'], ['created_by_account_id', 'accounts', true]],
    totw_voting_periods: [['created_by_account_id', 'accounts', true]],
    totw_candidates: [['period_id', 'totw_voting_periods'], ['account_id', 'accounts']],
    totw_votes: [['period_id', 'totw_voting_periods'], ['voter_account_id', 'accounts'], ['voted_for_account_id', 'accounts']],
    totw_winners: [['period_id', 'totw_voting_periods'], ['account_id', 'accounts']],
  };
  let removed;
  do {
    removed = false;
    for (const [table, fields] of Object.entries(references)) tables[table] = tables[table].filter(row => {
      const missing = fields.find(([field, target, optional]) => !(optional && row[field] == null) && tables[target].every(parent => parent.id !== row[field]));
      if (!missing) return true;
      hold(table, row, `unresolved_reference:${missing[0]}`); removed = true; return false;
    });
    for (const table of ['totw_votes', 'totw_winners']) tables[table] = tables[table].filter(row => {
      const accountId = table === 'totw_votes' ? row.voted_for_account_id : row.account_id;
      if (tables.totw_candidates.some(candidate => candidate.period_id === row.period_id && candidate.account_id === accountId && candidate.position === row.position)) return true;
      hold(table, row, 'unresolved_candidate'); removed = true; return false;
    });
  } while (removed);
  for (const [table, rows] of Object.entries(tables)) rows.sort((left, right) => key(left, tableKeys[table]).localeCompare(key(right, tableKeys[table]), 'en'));
  holds.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), 'en'));
  return result;
}
