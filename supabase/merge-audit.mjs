import { createHash } from 'node:crypto';
import { normalizeLegacy, legacyTables, tableKeys } from './merge-normalize.mjs';

export function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(item => canonical(item));
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).toSorted((a,b)=>a.localeCompare(b,'en')).map(key => [key, canonical(value[key])])) : value;
}
export const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export const digest = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex');
export const rowKey = (table, row) => JSON.stringify(tableKeys[table].map(key => row[key]));
const positions = new Set(['ST','WG','CM','DEF','GK','FLEX','CB','LB','RB','CDM','CAM','LW','RW']);
const mediaFields = new Set(['image_url','pending_image_url','logo_url','cover_image_url']);
const identityFields = new Set(['username','email','strikers_id','owner_account_id','player_username_snapshot']);
const numericStats = ['games','wins','draws','losses','goals','assists','passes','tackles','deflects','catches','cleanSheets','motm'];
const profileFields = ['sub','provider_id','avatar_url','email','email_verified','full_name','name','picture','user_name','preferred_username'];
const pick = (row, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function rowProblem(table, row, all, now) {
  for (const [field,value] of Object.entries(row)) {
    if (typeof value === 'string' && value.length > (['body','image_url','pending_image_url','logo_url','cover_image_url'].includes(field) ? 10_000_000 : 100_000)) return `oversized:${field}`;
    if (value !== null && /^(created_at|submitted_at|reviewed_at|updated_at)$/.test(field)
      && (!Number.isFinite(Date.parse(value)) || Date.parse(value) > now)) return `invalid_timestamp:${field}`;
  }
  const statuses = {
    teams: ['pending','approved','rejected'], submissions: ['pending','approved','rejected'],
    position_change_requests: ['pending','approved','denied'], scheduled_matches: ['scheduled','completed','cancelled','postponed'],
    totw_voting_periods: ['open','closed','resolved'],
  };
  if (Object.hasOwn(statuses,table) && !statuses[table].includes(row.status)) return 'invalid_status';
  if (table === 'position_change_requests' && (!positions.has(row.from_pos) || !positions.has(row.to_pos))) return 'invalid_requested_position';
  if (table === 'scheduled_matches' && (row.home_team_id === row.away_team_id || ['home_score','away_score'].some(field=>row[field]!=null && (!Number.isSafeInteger(row[field]) || row[field]<0)))) return 'invalid_fixture';
  if (table === 'teams' && (!object(row.lineup) || typeof row.name !== 'string' || row.name.length > 160)) return 'invalid_team';
  if (table === 'totw_voting_periods' && !(Date.parse(row.closes_at)>Date.parse(row.opens_at))) return 'invalid_voting_dates';
  if (table !== 'settings') return null;
  if (row.key === 'current_season') return typeof row.value === 'string' && row.value.trim().length>0 && row.value.length<=160 ? null : 'invalid_current_season';
  if (!['position_weights','season_champions'].includes(row.key) || row.value === null) return null;
  let value;
  try { value=JSON.parse(row.value); } catch { return 'invalid_setting_json'; }
  if (!object(value)) return 'invalid_setting_shape';
  if (row.key === 'position_weights') return Object.values(value).every(weights=>object(weights) && Object.values(weights).every(weight=>typeof weight==='number' && Number.isFinite(weight) && weight>=0)) ? null : 'invalid_position_weights';
  const teams=new Set(all.teams.map(team=>team.id));
  return Object.values(value).every(champions=>object(champions) && Number.isFinite(champions.setAt)
    && (!champions.winnerTeamId || teams.has(champions.winnerTeamId)) && (!champions.runnerUpTeamId || teams.has(champions.runnerUpTeamId))
    && (!champions.winnerTeamId || champions.winnerTeamId!==champions.runnerUpTeamId)) ? null : 'invalid_season_champions';
}

export function accountProblems(row, now) {
  const reasons = [];
  if (!positions.has(row.position)) reasons.push('unsupported_position');
  if (!row.stats || Array.isArray(row.stats) || typeof row.stats !== 'object'
    || Object.values(row.stats).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) reasons.push('invalid_stats');
  if (Array.isArray(row.matches)) {
    if (new Set(row.matches.map(match => match?.id)).size !== row.matches.length) reasons.push('duplicate_match_ids');
    for (const match of row.matches) {
      if (!match || typeof match !== 'object' || Array.isArray(match) || !match.id || !['W','D','L'].includes(match.result) || !Number.isFinite(match.date) || match.date > now
        || numericStats.filter(key => !['games','wins','draws','losses','cleanSheets','motm'].includes(key)).some(key => !Number.isFinite(match[key]) || match[key] < 0)) reasons.push('invalid_match');
    }
    if (row.stats?.games !== undefined && (row.stats.games !== (row.stats.wins ?? 0) + (row.stats.draws ?? 0) + (row.stats.losses ?? 0))) reasons.push('games_outcomes_mismatch');
    if (row.stats?.games !== undefined && row.stats.games !== row.matches.length) reasons.push('historical_totals_differ_from_matches');
  }
  else {reasons.push('invalid_match_history');}
  return [...new Set(reasons)];
}

// Only a missing, nonprivileged Discord identity can be imported. Existing identities are never overwritten.
export function importedIdentity(account, source, destination) {
  const user = source.users.find(row => row.id === account.id);
  const identities = source.identities.filter(row => row.user_id === account.id);
  if (!user || identities.length !== 1) return { reason: 'missing_or_multiple_identity' };
  const identity = identities[0];
  if (user.is_super_admin || user.is_anonymous || user.is_sso_user || user.deleted_at || user.banned_until
    || user.role !== 'authenticated' || user.aud !== 'authenticated' || user.raw_app_meta_data?.provider !== 'discord'
    || !equal(user.raw_app_meta_data?.providers, ['discord']) || identity.provider !== 'discord'
    || !/^\d{15,22}$/.test(identity.provider_id) || identity.identity_data?.sub !== identity.provider_id
    || user.raw_user_meta_data?.sub !== identity.provider_id) return { reason: 'unverified_discord_identity' };
  if (destination.users.some(row => row.id === account.id || (user.email && row.email?.toLowerCase() === user.email.toLowerCase()))
    || destination.identities.some(row => row.id === identity.id || (row.provider === 'discord' && row.provider_id === identity.provider_id))) return { reason: 'identity_collision' };
  if (Object.keys(user.raw_app_meta_data).some(key => !['provider','providers'].includes(key))) return { reason: 'unexpected_auth_authority_metadata' };
  const metadata = pick(identity.identity_data, profileFields);
  // No password or email recovery credentials are copied; Discord must authenticate again.
  return {
    user: { id: user.id, instance_id: user.instance_id, aud: 'authenticated', role: 'authenticated', email: user.email,
      email_confirmed_at: user.email_confirmed_at, created_at: user.created_at, updated_at: user.created_at,
      encrypted_password: '', confirmation_token: '', recovery_token: '', email_change_token_new: '', email_change: '',
      raw_app_meta_data: { provider: 'discord', providers: ['discord'] }, raw_user_meta_data: metadata,
      is_super_admin: false, is_anonymous: false, is_sso_user: false },
    identity: { id: identity.id, user_id: user.id, provider: 'discord', provider_id: identity.provider_id,
      identity_data: metadata, created_at: identity.created_at, updated_at: identity.created_at },
  };
}

export function auditMerge(source, destination, manifest, now = Date.now()) {
  const findings = [];
  const filtered = structuredClone(source.legacy);
  const auth = [];
  const hold = (table, id, reason, field) => { findings.push({ table, id, reason, ...(field && { field }) }); };
  for (const table of legacyTables) {
    if (!Array.isArray(filtered[table]) || !Array.isArray(destination.legacy[table])) throw new TypeError(`Missing legacy table: ${table}`);
    filtered[table] = filtered[table].flatMap(row => {
      const id = row.id ?? row.key;
      const baseline = destination.legacy[table].find(item => (item.id ?? item.key) === id);
      const withheld = () => baseline ? [structuredClone(baseline)] : [];
      const text = JSON.stringify(row);
      if (/\[pentest\]|pentest_|PTe[\da-f]{7,}/i.test(text)) { hold(table,id,'test_or_attack_marker'); return []; }
      if (/<script\b|javascript:|data:text\/html|onerror\s*=/i.test(text)) { hold(table,id,'unsafe_content'); return withheld(); }
      const problem = rowProblem(table,row,source.legacy,now);
      if(problem) { hold(table,id,problem); return withheld(); }
      if (table === 'accounts') {
        for (const reason of accountProblems(row, now)) {
          hold(table,id,reason);
          if (reason === 'unsupported_position' && baseline && positions.has(baseline.position)) row.position = baseline.position;
          else if (baseline && reason === 'historical_totals_differ_from_matches') { row.stats = baseline.stats; row.matches = baseline.matches; }
          else {return withheld();}
        }
        const current = destination.current.accounts.find(item => item.id === id);
        if (current) {
          const sourceLinks = source.identities.filter(item => item.user_id === id).map(item => [item.provider,item.provider_id]).toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
          const targetLinks = destination.identities.filter(item => item.user_id === id).map(item => [item.provider,item.provider_id]).toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
          if (!equal(sourceLinks,targetLinks)) { hold(table,id,'changed_identity_link'); return withheld(); }
        } else {
          const imported = importedIdentity(row, source, destination);
          if (imported.reason) { hold(table,id,imported.reason); return withheld(); }
          auth.push(imported);
        }
      }
      return [row];
    });
  }
  const normalized = normalizeLegacy(filtered, manifest);
  const baseline = normalizeLegacy(destination.legacy, manifest);
  if (normalized.errors.length > 0 || baseline.errors.length > 0) throw new Error(`Normalization failed: ${JSON.stringify([...normalized.errors,...baseline.errors])}`);
  findings.push(...normalized.holds, ...baseline.holds.map(row => ({ ...row, reason: `baseline:${row.reason}` })));
  const operations = [];
  const deltas = [];
  for (const [table, rows] of Object.entries(normalized.tables)) {
    const old = new Map(baseline.tables[table].map(row => [rowKey(table,row),row]));
    const current = new Map(destination.current[table].map(row => [rowKey(table,row),row]));
    for (const row of rows) {
      const key = rowKey(table,row), before = current.get(key), original = old.get(key);
      if (!before && original) { hold(table,key,'destination_removed_record'); continue; }
      const after = before ? { ...before } : { ...row };
      delete after.username_lower;
      let changed = !before;
      const statsConflict = table === 'accounts' && before && ['stats','matches'].some(field =>
        !equal(row[field],original?.[field]) && !equal(before[field],original?.[field]) && !equal(before[field],row[field]));
      for (const [field,value] of Object.entries(row)) {
        if (equal(value, original?.[field])) continue;
        deltas.push({ table, id: key, field, kind: original ? 'changed' : 'new' });
        if (statsConflict && ['stats','matches'].includes(field)) { hold(table,key,'stats_history_conflict',field); continue; }
        if (before && (identityFields.has(field) || mediaFields.has(field))) { hold(table,key,'identity_or_media_change_requires_review',field); continue; }
        if (before && !equal(before[field],original?.[field]) && !equal(before[field],value)) { hold(table,key,'destination_conflict',field); continue; }
        if (value && (mediaFields.has(field) || field.endsWith('url'))) {
          let valid = false;
          try { const url = new URL(value); valid = url.protocol === 'https:' && !url.username && !url.password && ['cdn.discordapp.com','media.discordapp.net','steamcommunity.com','www.twitch.tv','twitch.tv','www.youtube.com','youtube.com'].includes(url.hostname); } catch { /* Malformed or embedded URLs are held for explicit media review. */ }
          if (!valid) { hold(table,key,'unreviewed_url',field); if (!before) after[field] = null; continue; }
        }
        if (before && equal(before[field],value)) {
          continue;
        }

        after[field] = value; changed = true;
      }
      if (changed) operations.push({ table, key: pick(row,tableKeys[table]), before: before ?? null, after });
    }
  }
  const newAccounts = new Set(operations.filter(op => op.table === 'accounts' && !op.before).map(op => op.after.id));
  const acceptedAuth = auth.filter(item => newAccounts.has(item.user.id));
  return { version: 1, auditedAt: new Date(now).toISOString(), sourceHash: digest(source), destinationHash: digest(destination), manifest,
    operations, auth: acceptedAuth, findings, deltas,
    counts: { sourceAccounts: source.legacy.accounts.length, destinationAccounts: destination.current.accounts.length,
      inserts: operations.filter(op => !op.before).length, updates: operations.filter(op => op.before).length, identities: acceptedAuth.length, held: findings.length } };
}
