// Supabase client + db API
// This replaces the in-memory _mem.kv storage from the prototype.
// The shape of every method matches what the React code expects.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Copy .env.example to .env and fill in your project credentials.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE flow is the modern default for new Supabase projects. Token exchange
    // happens via a code in the URL query string (?code=...) instead of a fragment.
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
  },
});

// Diagnostic: log any auth state changes so we can see what's happening in the console
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[supabase auth]', event, session ? `session=${session.user?.id}` : 'no session');
  });
}

// =====================================================================
// AUTH
// =====================================================================
export const auth = {
  // Sign up — creates Supabase auth user + a row in `accounts` table.
  // New accounts use a REAL email (also enables password reset).
  async signUp({ username, password, position, email, country }) {
    const realEmail = (email || '').trim().toLowerCase();
    if (!realEmail) throw new Error('Email is required');
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: realEmail, password,
      options: { data: { username } },
    });
    if (authErr) throw authErr;
    if (!authData.user) throw new Error('Signup failed');

    // Create the player profile row
    const { error: profileErr } = await supabase.from('accounts').insert({
      id: authData.user.id,
      username,
      username_lower: username.toLowerCase(),
      position: position || 'CM',
      email: realEmail,
      country: country || null,
      stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0 },
      matches: [],
      awards: [],
      championships: [],
      created_at: new Date().toISOString(),
    });
    if (profileErr) throw profileErr;
    return await db.getAccount(username);
  },

  // Sign in — users type their username. We look up the account to find
  // the email Supabase auth needs. Older accounts created before the
  // real-email change still use the username@asl.local pseudo-email.
  async signIn({ username, password }) {
    const account = await db.getAccount(username);
    const email = (account && account.email)
      ? account.email
      : `${username.toLowerCase()}@asl.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Invalid credentials');
    return await db.getAccount(username);
  },

  // Send a password-reset email. Only works for accounts that have a real
  // email on file. Uses a SECURITY DEFINER function to look up the email
  // since the accounts table itself is read-only to authenticated users
  // (and the user is signed out when triggering this flow).
  // Returns { ok } or { ok:false, reason }.
  async sendPasswordReset(username) {
    if (!username || !username.trim()) return { ok: false, reason: 'Please enter your username.' };
    const { data: email, error: lookupError } = await supabase
      .rpc('get_email_for_password_reset', { p_username: username.trim() });
    if (lookupError) {
      console.error('Password reset lookup error:', lookupError);
      return { ok: false, reason: 'Could not look up account. Please try again.' };
    }
    if (!email) {
      return { ok: false, reason: 'No account with that username, or that account has no email on file. Ask an admin if you forgot which email you registered with.' };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true, email };
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  // OAuth sign-in via Discord. Redirects the user to Discord's auth screen,
  // then back to the app with a session token. If it's the user's first
  // sign-in, we create a fresh ASL account row in the SIGNED_IN handler
  // in App.jsx using their Discord username.
  async signInWithDiscord() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin,
        scopes: 'identify email',
      },
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  },

  // Update the current user's password. Used during the password-recovery
  // flow after the user clicks the reset email link. Returns { ok } or
  // { ok:false, reason }.
  async updatePassword(newPassword) {
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, reason: 'Password must be at least 6 characters.' };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  },

  // Returns the currently logged-in account (or null).
  // Looks up by the permanent auth user id, so username changes never break the session.
  async getCurrent() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) return null;
    return await db.getAccountById(data.session.user.id);
  },
};

// =====================================================================
// DB API — same shape as the prototype's `db` object
// =====================================================================

const rowToAccount = (row) => row ? ({
  id: row.id,
  username: row.username,
  position: row.position,
  teamId: row.team_id,
  imageUrl: row.image_url,
  pendingImageUrl: row.pending_image_url,
  email: row.email || null,
  country: row.country || null,
  stats: row.stats || {},
  matches: row.matches || [],
  awards: row.awards || [],
  // Team championships earned. Each entry: { season, placement: 'winner'|'runner_up', teamId, awardedAt }
  championships: row.championships || [],
  totwUntil: row.totw_until ? new Date(row.totw_until).getTime() : null,
  cheater: !!row.cheater,
  // Strikers Club player ID (set once on first successful match import; used
  // to auto-match players on future imports).
  strikersId: row.strikers_id || null,
  // Player's public Steam profile URL (display-only, no verification).
  steamUrl: row.steam_url || null,
  createdAt: new Date(row.created_at).getTime(),
}) : null;

const rowToTeam = (row) => row ? ({
  id: row.id,
  name: row.name,
  tag: row.tag,
  color: row.color,
  description: row.description,
  ownerUsername: row.owner_username,
  members: row.members || [],
  // `pending_members` stores invitation records: [{username, status, respondedAt}].
  // Legacy: older rows may hold plain strings (usernames). Normalize on read so
  // the app always sees the object shape.
  invitations: (row.pending_members || []).map(entry =>
    typeof entry === 'string'
      ? { username: entry, status: 'pending', respondedAt: null }
      : entry
  ),
  // Legacy alias — some places still read `pendingMembers` as a username list
  pendingMembers: (row.pending_members || []).map(entry =>
    typeof entry === 'string' ? entry : entry.username
  ),
  totw: row.totw || false,
  totwSetAt: row.totw_set_at ? new Date(row.totw_set_at).getTime() : null,
  // Captain-chosen formation name (see FORMATIONS in App.jsx)
  formation: row.formation || '2-1-2',
  // Captain-chosen lineup: slot-id → username. Slot ids depend on the formation.
  // Empty object means "fall back to auto-assign by position".
  lineup: row.lineup || {},
  status: row.status,
  logoUrl: row.logo_url,
  createdAt: new Date(row.created_at).getTime(),
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null,
  reviewedBy: row.reviewed_by,
  rejectionReason: row.rejection_reason,
}) : null;

const rowToNews = (row) => row ? ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  pinned: row.pinned,
  homeTeamId: row.home_team_id,
  awayTeamId: row.away_team_id,
  homeScore: row.home_score,
  awayScore: row.away_score,
  date: row.event_date ? new Date(row.event_date).getTime() : null,
  notes: row.notes,
  author: row.author,
  createdAt: new Date(row.created_at).getTime(),
  autoFromSubmission: row.auto_from_submission,
}) : null;

const rowToSubmission = (row) => row ? ({
  id: row.id,
  status: row.status,
  submittedBy: row.submitted_by,
  submittedAt: new Date(row.submitted_at).getTime(),
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null,
  rejectionReason: row.rejection_reason,
  matchInfo: row.match_info,
  playerStats: row.player_stats || [],
  edits: row.edits || [],
}) : null;

export const db = {
  // ====== ACCOUNTS ======
  async getAccount(username) {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('username_lower', username.toLowerCase())
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return rowToAccount(data);
  },

  async getAccountById(id) {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return rowToAccount(data);
  },

  async saveAccount(account) {
    // Update by stable id when we have it, else fall back to username
    const query = supabase.from('accounts').update({
      position: account.position,
      team_id: account.teamId,
      image_url: account.imageUrl,
      pending_image_url: account.pendingImageUrl ?? null,
      email: account.email ?? null,
      country: account.country ?? null,
      stats: account.stats,
      matches: account.matches,
      awards: account.awards,
      championships: account.championships || [],
      totw_until: account.totwUntil ? new Date(account.totwUntil).toISOString() : null,
      cheater: !!account.cheater,
      strikers_id: account.strikersId || null,
      steam_url: account.steamUrl || null,
    });
    const { error } = account.id
      ? await query.eq('id', account.id)
      : await query.eq('username_lower', account.username.toLowerCase());
    if (error) throw error;
  },

  // Change a player's username. Checks uniqueness first.
  // Returns { ok: true } or { ok: false, reason: '...' }
  async renameAccount(accountId, newUsername) {
    const trimmed = newUsername.trim();
    const lower = trimmed.toLowerCase();
    // Uniqueness check — is this name taken by someone else?
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('username_lower', lower)
      .maybeSingle();
    if (existing && existing.id !== accountId) {
      return { ok: false, reason: 'That username is already taken.' };
    }
    const { error } = await supabase
      .from('accounts')
      .update({ username: trimmed, username_lower: lower })
      .eq('id', accountId);
    if (error) return { ok: false, reason: error.message };
    // Keep auth metadata in sync if this is the current user
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session?.user?.id === accountId) {
        await supabase.auth.updateUser({ data: { username: trimmed } });
      }
    } catch (e) { /* metadata sync is best-effort */ }
    return { ok: true };
  },

  async listAccounts() {
    const { data, error } = await supabase.from('accounts').select('*');
    if (error) { console.error(error); return []; }
    return (data || []).map(rowToAccount);
  },

  // ====== TEAMS ======
  async getTeam(id) {
    const { data, error } = await supabase.from('teams').select('*').eq('id', id).maybeSingle();
    if (error) { console.error(error); return null; }
    return rowToTeam(data);
  },

  async saveTeam(team) {
    const row = {
      id: team.id,
      name: team.name,
      tag: team.tag,
      color: team.color,
      description: team.description,
      owner_username: team.ownerUsername,
      members: team.members,
      pending_members: team.pendingMembers || [],
      totw: team.totw || false,
      totw_set_at: team.totwSetAt ? new Date(team.totwSetAt).toISOString() : null,
      formation: team.formation || '2-1-2',
      lineup: team.lineup || {},
      status: team.status,
      logo_url: team.logoUrl,
      reviewed_at: team.reviewedAt ? new Date(team.reviewedAt).toISOString() : null,
      reviewed_by: team.reviewedBy,
      rejection_reason: team.rejectionReason,
    };
    const { error } = await supabase.from('teams').upsert(row);
    if (error) throw error;
  },

  async deleteTeam(id) {
    const { error } = await supabase.from('teams').delete().eq('id', id);
    if (error) throw error;
  },

  async listTeams() {
    const { data, error } = await supabase.from('teams').select('*');
    if (error) { console.error(error); return []; }
    return (data || []).map(rowToTeam);
  },

  // ====== SEASON ======
  async getSeason() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'current_season').maybeSingle();
    return data?.value || 'S1';
  },

  async setSeason(s) {
    await supabase.from('settings').upsert({ key: 'current_season', value: s });
  },

  // ====== SEASON CHAMPIONS ======
  // Stored as a JSON string under settings.key = 'season_champions'.
  // Shape: { "S1": { winnerTeamId: "t_xxx", runnerUpTeamId: "t_yyy", setAt: 1700000000000 }, ... }
  async getChampions() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'season_champions').maybeSingle();
    if (!data?.value) return {};
    try { return JSON.parse(data.value); } catch { return {}; }
  },
  async setChampions(championsObj) {
    await supabase.from('settings').upsert({ key: 'season_champions', value: JSON.stringify(championsObj) });
  },

  // ====== SESSION (handled by Supabase Auth — these are stubs for compat) ======
  async getSession() {
    const cur = await auth.getCurrent();
    return cur?.username || null;
  },
  async setSession() { /* handled by auth.signIn / signOut */ },

  // ====== ADMIN LIST ======
  async getAdminList() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'admin_list').maybeSingle();
    if (!data?.value) return [];
    try { return JSON.parse(data.value); } catch { return []; }
  },
  async setAdminList(usernames) {
    await supabase.from('settings').upsert({ key: 'admin_list', value: JSON.stringify(usernames) });
  },

  // ====== STAT WEIGHTINGS (custom ranking weights, set by super admins) ======
  async getWeightings() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'position_weights').maybeSingle();
    if (!data?.value) return null;
    try { return JSON.parse(data.value); } catch { return null; }
  },
  async setWeightings(weights) {
    await supabase.from('settings').upsert({ key: 'position_weights', value: JSON.stringify(weights) });
  },

  // ====== SUBMISSIONS ======
  async saveSubmission(sub) {
    const row = {
      id: sub.id,
      status: sub.status,
      submitted_by: sub.submittedBy,
      submitted_at: new Date(sub.submittedAt).toISOString(),
      reviewed_by: sub.reviewedBy,
      reviewed_at: sub.reviewedAt ? new Date(sub.reviewedAt).toISOString() : null,
      rejection_reason: sub.rejectionReason,
      match_info: sub.matchInfo,
      player_stats: sub.playerStats,
      edits: sub.edits || [],
    };
    const { error } = await supabase.from('submissions').upsert(row);
    if (error) throw error;
  },
  async deleteSubmission(id) {
    await supabase.from('submissions').delete().eq('id', id);
  },
  async listSubmissions() {
    const { data, error } = await supabase.from('submissions').select('*');
    if (error) { console.error(error); return []; }
    return (data || []).map(rowToSubmission);
  },

  // ====== NEWS ======
  async saveNews(item) {
    const row = {
      id: item.id,
      type: item.type,
      title: item.title,
      body: item.body,
      pinned: !!item.pinned,
      home_team_id: item.homeTeamId,
      away_team_id: item.awayTeamId,
      home_score: item.homeScore,
      away_score: item.awayScore,
      event_date: item.date ? new Date(item.date).toISOString() : null,
      notes: item.notes,
      author: item.author,
      auto_from_submission: item.autoFromSubmission,
    };
    const { error } = await supabase.from('news').upsert(row);
    if (error) throw error;
  },
  async deleteNews(id) {
    await supabase.from('news').delete().eq('id', id);
  },
  async listNews() {
    const { data, error } = await supabase.from('news').select('*');
    if (error) { console.error(error); return []; }
    return (data || []).map(rowToNews);
  },

  // ============ RULES SECTIONS ============
  // The rulebook is a list of sections shown to all players on the RULES tab.
  // Admins add, edit, delete, and reorder sections from ADMIN → RULES.
  // Body supports minimal markdown: **bold**, *italic*, ## heading, - list.
  async listRulesSections() {
    const { data, error } = await supabase
      .from('rules_sections')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) { console.error(error); return []; }
    return (data || []).map(r => ({
      id: r.id,
      title: r.title,
      body: r.body || '',
      sortOrder: r.sort_order,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  },
  async saveRulesSection(section) {
    const row = {
      id: section.id,
      title: section.title,
      body: section.body || '',
      sort_order: section.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('rules_sections').upsert(row);
    if (error) throw error;
  },
  async deleteRulesSection(id) {
    const { error } = await supabase.from('rules_sections').delete().eq('id', id);
    if (error) throw error;
  },
  // Bulk-set sort_order for a list of section ids. Used by drag-reorder.
  async reorderRulesSections(orderedIds) {
    // Sequential updates (small list, fine to loop). Wraps in Promise.all
    // for parallel dispatch.
    await Promise.all(orderedIds.map((id, idx) =>
      supabase.from('rules_sections').update({ sort_order: idx, updated_at: new Date().toISOString() }).eq('id', id)
    ));
  },

  // ============ TOTW VOTING ============
  // List all voting periods (most recent first). Used by both admin (to manage
  // periods) and players (to see if a voting period is currently open).
  async listTotwPeriods() {
    const { data, error } = await supabase
      .from('totw_voting_periods')
      .select('*')
      .order('opens_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return (data || []).map(r => ({
      id: r.id,
      opensAt: new Date(r.opens_at).getTime(),
      closesAt: new Date(r.closes_at).getTime(),
      status: r.status,
      eligiblePlayers: r.eligible_players || [],
      winners: r.winners,
      createdBy: r.created_by,
      createdAt: new Date(r.created_at).getTime(),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).getTime() : null,
    }));
  },

  async createTotwPeriod({ closesAt, eligiblePlayers, createdBy }) {
    const { data, error } = await supabase
      .from('totw_voting_periods')
      .insert({
        closes_at: new Date(closesAt).toISOString(),
        eligible_players: eligiblePlayers || [],
        created_by: createdBy,
        status: 'open',
      })
      .select()
      .single();
    if (error) { console.error(error); throw error; }
    return data;
  },

  async updateTotwPeriod(periodId, fields) {
    const payload = {};
    if (fields.status !== undefined) payload.status = fields.status;
    if (fields.winners !== undefined) payload.winners = fields.winners;
    if (fields.resolvedAt !== undefined) payload.resolved_at = new Date(fields.resolvedAt).toISOString();
    if (fields.eligiblePlayers !== undefined) payload.eligible_players = fields.eligiblePlayers;
    if (fields.closesAt !== undefined) payload.closes_at = new Date(fields.closesAt).toISOString();
    const { error } = await supabase
      .from('totw_voting_periods')
      .update(payload)
      .eq('id', periodId);
    if (error) { console.error(error); throw error; }
  },

  async deleteTotwPeriod(periodId) {
    // Votes cascade-delete via the FK
    const { error } = await supabase
      .from('totw_voting_periods')
      .delete()
      .eq('id', periodId);
    if (error) { console.error(error); throw error; }
  },

  // List all votes for a period. Admin needs this to see tallies and pick
  // the winners. Players need it to (a) see who they've already voted for in
  // the current period, and (b) see live results once voting closes.
  async listTotwVotes(periodId) {
    const { data, error } = await supabase
      .from('totw_votes')
      .select('*')
      .eq('period_id', periodId);
    if (error) { console.error(error); return []; }
    return (data || []).map(r => ({
      id: r.id,
      periodId: r.period_id,
      voterUsername: r.voter_username,
      position: r.position,
      votedForUsername: r.voted_for_username,
      votedAt: new Date(r.voted_at).getTime(),
    }));
  },

  // Submit all 4 votes (1 GK, 1 DEF, 1 CM, 1 ST) for the current period.
  // Wipes any prior votes by this voter in this period first so re-submission
  // is idempotent. Returns { ok } or { ok:false, reason }.
  async submitTotwVotes(periodId, voterUsername, votes) {
    if (!votes || !votes.gk || !votes.def || !votes.cm || !votes.st) {
      return { ok: false, reason: 'You need to pick one player per position.' };
    }
    // Wipe any prior votes for this voter+period
    await supabase
      .from('totw_votes')
      .delete()
      .eq('period_id', periodId)
      .eq('voter_username', voterUsername);
    // Insert the new four
    const rows = [
      { period_id: periodId, voter_username: voterUsername, position: 'GK',  voted_for_username: votes.gk },
      { period_id: periodId, voter_username: voterUsername, position: 'DEF', voted_for_username: votes.def },
      { period_id: periodId, voter_username: voterUsername, position: 'CM',  voted_for_username: votes.cm },
      { period_id: periodId, voter_username: voterUsername, position: 'ST',  voted_for_username: votes.st },
    ];
    const { error } = await supabase.from('totw_votes').insert(rows);
    if (error) { console.error(error); return { ok: false, reason: error.message }; }
    return { ok: true };
  },

  // ============ SCHEDULED MATCHES ============
  // Row ↔ app object converter — keeps the UI free of snake_case plumbing
  // and lets JS code work with camelCase dates as numeric timestamps.
  _rowToSchedMatch(r) {
    return {
      id: r.id,
      season: r.season,
      week: r.week,
      homeTeamId: r.home_team_id,
      awayTeamId: r.away_team_id,
      scheduledDate: r.scheduled_date ? new Date(r.scheduled_date).getTime() : null,
      streamUrl: r.stream_url || '',
      matchType: r.match_type || 'regular',
      playoffRound: r.playoff_round || null,
      status: r.status || 'scheduled',
      homeScore: r.home_score,
      awayScore: r.away_score,
      linkedMatchId: r.linked_match_id || null,
      notes: r.notes || '',
      createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    };
  },

  async listScheduledMatches(season = null) {
    let q = supabase.from('scheduled_matches').select('*').order('week', { ascending: true });
    if (season) q = q.eq('season', season);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data || []).map(r => this._rowToSchedMatch(r));
  },

  async saveScheduledMatch(match) {
    const payload = {
      id: match.id,
      season: match.season,
      week: match.week,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      scheduled_date: match.scheduledDate ? new Date(match.scheduledDate).toISOString() : null,
      stream_url: match.streamUrl || null,
      match_type: match.matchType || 'regular',
      playoff_round: match.playoffRound || null,
      status: match.status || 'scheduled',
      home_score: (match.homeScore === undefined || match.homeScore === null || match.homeScore === '') ? null : Number(match.homeScore),
      away_score: (match.awayScore === undefined || match.awayScore === null || match.awayScore === '') ? null : Number(match.awayScore),
      linked_match_id: match.linkedMatchId || null,
      notes: match.notes || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('scheduled_matches')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    if (error) { console.error(error); throw error; }
    return this._rowToSchedMatch(data);
  },

  // Bulk insert — used by the round-robin generator. Does an upsert so re-running
  // with the same ids updates in place rather than creating duplicates.
  async bulkInsertScheduledMatches(matches) {
    if (!matches || matches.length === 0) return [];
    const payload = matches.map(m => ({
      id: m.id,
      season: m.season,
      week: m.week,
      home_team_id: m.homeTeamId,
      away_team_id: m.awayTeamId,
      scheduled_date: m.scheduledDate ? new Date(m.scheduledDate).toISOString() : null,
      stream_url: m.streamUrl || null,
      match_type: m.matchType || 'regular',
      playoff_round: m.playoffRound || null,
      status: m.status || 'scheduled',
      home_score: m.homeScore ?? null,
      away_score: m.awayScore ?? null,
      linked_match_id: m.linkedMatchId || null,
      notes: m.notes || null,
    }));
    const { data, error } = await supabase
      .from('scheduled_matches')
      .upsert(payload, { onConflict: 'id' })
      .select();
    if (error) { console.error(error); throw error; }
    return (data || []).map(r => this._rowToSchedMatch(r));
  },

  async deleteScheduledMatch(id) {
    const { error } = await supabase.from('scheduled_matches').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
  },

  // Wipe an entire season's schedule — used when admin wants to regenerate
  // from scratch.
  async deleteScheduledSeason(season) {
    const { error } = await supabase.from('scheduled_matches').delete().eq('season', season);
    if (error) { console.error(error); throw error; }
  },

  // ============ TRANSFERS ============
  _rowToTransfer(r) {
    return {
      id: r.id,
      season: r.season,
      playerUsername: r.player_username,
      fromTeamId: r.from_team_id || null,
      toTeamId: r.to_team_id || null,
      kind: r.kind,                      // 'signing' | 'transfer' | 'release'
      windowType: r.window_type || null, // 'league' | 'cross_league' | null
      createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
      createdBy: r.created_by || null,
    };
  },

  async listTransfers(season = null) {
    let q = supabase.from('transfers').select('*').order('created_at', { ascending: false });
    if (season) q = q.eq('season', season);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data || []).map(r => this._rowToTransfer(r));
  },

  async saveTransfer(tx) {
    const payload = {
      id: tx.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      season: tx.season,
      player_username: (tx.playerUsername || '').toLowerCase(),
      from_team_id: tx.fromTeamId || null,
      to_team_id: tx.toTeamId || null,
      kind: tx.kind,
      window_type: tx.windowType || null,
      created_by: tx.createdBy || null,
    };
    const { data, error } = await supabase
      .from('transfers')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    if (error) { console.error(error); throw error; }
    return this._rowToTransfer(data);
  },

  async deleteTransfer(id) {
    const { error } = await supabase.from('transfers').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
  },

  // ============ ARTICLES ============
  _rowToArticle(r) {
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      coverImageUrl: r.cover_image_url || '',
      author: r.author,
      body: r.body || '',
      excerpt: r.excerpt || '',
      publishedAt: r.published_at ? new Date(r.published_at).getTime() : null,
      updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    };
  },

  async listArticles() {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return (data || []).map(r => this._rowToArticle(r));
  },

  async getArticleBySlug(slug) {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return data ? this._rowToArticle(data) : null;
  },

  async saveArticle(article) {
    const payload = {
      id: article.id || article.slug,
      slug: article.slug,
      title: article.title,
      cover_image_url: article.coverImageUrl || null,
      author: (article.author || '').toLowerCase(),
      body: article.body || '',
      excerpt: article.excerpt || null,
      updated_at: new Date().toISOString(),
    };
    // Preserve original publish date on edits, set it fresh on first save
    if (!article.publishedAt) {
      payload.published_at = new Date().toISOString();
    } else {
      payload.published_at = new Date(article.publishedAt).toISOString();
    }
    const { data, error } = await supabase
      .from('articles')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    if (error) { console.error(error); throw error; }
    return this._rowToArticle(data);
  },

  async deleteArticle(id) {
    const { error } = await supabase.from('articles').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
  },

  // Convenience helper used by auto-log hooks. Call this whenever a player's
  // teamId changes to record it as a transfer. kind is derived from the
  // from/to team IDs.
  async logTransfer({ playerUsername, fromTeamId, toTeamId, season, createdBy, windowType = null }) {
    if (!playerUsername) return null;
    // No-op if the team didn't actually change
    const from = fromTeamId || null;
    const to = toTeamId || null;
    if (from === to) return null;
    let kind;
    if (!from && to) kind = 'signing';
    else if (from && !to) kind = 'release';
    else kind = 'transfer';
    return this.saveTransfer({
      playerUsername, fromTeamId: from, toTeamId: to,
      season: season || 'S1', kind, windowType, createdBy,
    });
  },
};
