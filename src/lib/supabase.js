// Supabase client + db API
// This replaces the in-memory _mem.kv storage from the prototype.
// The shape of every method matches what the React code expects.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Copy .env.example to .env and fill in your project credentials.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
      stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passes: 0, passAccuracy: 0, tackles: 0, interceptions: 0, saves: 0, catches: 0, cleanSheets: 0 },
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
  // real-email change still use the username@napl.local pseudo-email.
  async signIn({ username, password }) {
    const account = await db.getAccount(username);
    const email = (account && account.email)
      ? account.email
      : `${username.toLowerCase()}@napl.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Invalid credentials');
    return await db.getAccount(username);
  },

  // Send a password-reset email. Only works for accounts that have a real
  // email on file. Returns { ok } or { ok:false, reason }.
  async sendPasswordReset(username) {
    const account = await db.getAccount(username);
    if (!account) return { ok: false, reason: 'No account with that username.' };
    if (!account.email) {
      return { ok: false, reason: 'This account has no email on file. Add one from the Home page after logging in, or ask an admin.' };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(account.email, {
      redirectTo: window.location.origin,
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true, email: account.email };
  },

  async signOut() {
    await supabase.auth.signOut();
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
  pendingMembers: row.pending_members || [],
  totw: row.totw || false,
  totwSetAt: row.totw_set_at ? new Date(row.totw_set_at).getTime() : null,
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
};
