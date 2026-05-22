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
  // Sign up — creates Supabase auth user + a row in `accounts` table
  async signUp({ username, password, position }) {
    const email = `${username.toLowerCase()}@napl.local`; // pseudo-email for Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email, password,
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
      stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passes: 0, passAccuracy: 0, tackles: 0, interceptions: 0, saves: 0, catches: 0, cleanSheets: 0 },
      matches: [],
      awards: [],
      created_at: new Date().toISOString(),
    });
    if (profileErr) throw profileErr;
    return await db.getAccount(username);
  },

  async signIn({ username, password }) {
    const email = `${username.toLowerCase()}@napl.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Invalid credentials');
    return await db.getAccount(username);
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  // Returns the currently logged-in account (or null)
  async getCurrent() {
    // getSession() reads the locally-stored session — fast and won't hang.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) return null;
    const username = data.session.user.user_metadata?.username;
    if (!username) return null;
    return await db.getAccount(username);
  },
};

// =====================================================================
// DB API — same shape as the prototype's `db` object
// =====================================================================

const rowToAccount = (row) => row ? ({
  username: row.username,
  position: row.position,
  teamId: row.team_id,
  imageUrl: row.image_url,
  stats: row.stats || {},
  matches: row.matches || [],
  awards: row.awards || [],
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

  async saveAccount(account) {
    const { error } = await supabase.from('accounts').update({
      position: account.position,
      team_id: account.teamId,
      image_url: account.imageUrl,
      stats: account.stats,
      matches: account.matches,
      awards: account.awards,
    }).eq('username_lower', account.username.toLowerCase());
    if (error) throw error;
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
