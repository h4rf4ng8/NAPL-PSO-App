import type { Database, Row, Prisma } from '../plugins/db/client.js';

const find = <T extends { id: string }>(rows: T[], args?: { where?: { id?: string } }) => args?.where?.id ? rows.filter(row => row.id === args.where!.id) : rows;

export const fixtureUser = '00000000-0000-4000-8000-000000000001';
export function payloadFixture() {
  const image = `data:image/png;base64,${Buffer.from('fixture image bytes'.repeat(10_000)).toString('base64')}`;
  const stats = { games: 10, wins: 5, draws: 2, losses: 3, goals: 8, assists: 7, passes: 30, tackles: 20, deflects: 0, catches: 0, cleanSheets: 2, motm: 1 };
  const accounts = Array.from({ length: 105 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, username: `Player ${index} 球`, position: 'CM',
    team_id: `t_${Math.floor(index / 15)}`, image_url: image, pending_image_url: image,
    email: `player${index}@example.test`, country: 'US', stats, season_stats: { all: stats, S1: stats, S2: stats, S3: stats },
    matches: Array.from({ length: 60 }, (_, ordinal) => ({ id: `m_${ordinal}`, date: ordinal, season: ordinal % 2 ? 'S1' : 'S2', opponent: `Opponent ${ordinal}`, result: 'W',
      ...stats, cleanSheet: true, motm: false, ownTeamId: `t_${Math.floor(index / 15)}`, extension: ordinal === 0 ? 'legacy 球⚽'.repeat(10_000) : { imported: true } })),
    awards: Array.from({ length: 20 }, (_, award) => ({ awardId: 'playmaker', season: `S${award}`, assignedBy: 'admin', assignedAt: award, extension: award === 0 ? 'legacy'.repeat(3000) : '' })),
    championships: [], totw_until: null, cheater: false, strikers_id: String(10_000 + index), steam_url: `https://example.test/${'球'.repeat(2000)}`, created_at: new Date(index),
  }));
  const teams = Array.from({ length: 7 }, (_, index) => ({ id: `t_${index}`, name: `Team ${index}`, tag: `T${index}`, color: '#123456', description: '球⚽'.repeat(1500),
    owner_account_id: accounts[index * 15]!.id, status: 'approved', logo_url: image, totw: false, totw_set_at: null,
    formation: '2-1-2', lineup: {}, created_at: new Date(index), reviewed_at: null, reviewed_by: null, rejection_reason: 'reason'.repeat(2000) }));
  const news = Array.from({ length: 105 }, (_, index) => ({ id: `n_${index}`, type: 'announcement', title: `News ${index} 球`, body: '球⚽'.repeat(12_000), notes: 'note'.repeat(2500), pinned: index === 0,
    author: 'admin', created_at: new Date(index), home_team_id: null, away_team_id: null, home_score: null, away_score: null, event_date: null, auto_from_submission: null }));
  const rules = Array.from({ length: 30 }, (_, index) => ({ id: `r_${index}`, title: `Rule ${index}`, body: 'rule body'.repeat(2000), sort_order: index, created_at: new Date(index), updated_at: new Date(index) }));
  const articles = Array.from({ length: 30 }, (_, index) => ({ id: `a_${index}`, slug: `article-${index}`, title: `Article ${index}`, body: 'article body'.repeat(2000), excerpt: 'excerpt'.repeat(1000), cover_image_url: image, author: 'admin', published_at: new Date(index), updated_at: new Date(index) }));
  const schedules = Array.from({ length: 105 }, (_, index) => ({ id: `s_${index}`, season_id: 'S2', week: index + 1, home_team_id: 't_0', away_team_id: 't_1', scheduled_date: new Date(index), stream_url: null,
    match_type: 'regular', playoff_round: null, status: 'scheduled', home_score: null, away_score: null, linked_match_id: null, notes: '球'.repeat(4000), created_at: new Date(index), updated_at: new Date(index) }));
  const transfers = Array.from({ length: 105 }, (_, index) => ({ id: `x_${index}`, season_id: 'S2', player_username: `Player ${index} 球`, from_team_id: null, to_team_id: 't_0', kind: 'signing', window_type: 'league', created_at: new Date(index), created_by: 'admin' }));
  const period = { id: '10000000-0000-4000-8000-000000000001', opens_at: new Date(0), closes_at: new Date(Date.now() + 86_400_000), status: 'open', created_by_account_id: fixtureUser, created_by: 'admin', created_at: new Date(0), resolved_at: null };
  const submissions = Array.from({ length: 105 }, (_, index) => ({ id: `sub_${index}`, match_info: { homeTeamId: 't_0', awayTeamId: 't_1', homeScore: 2, awayScore: 1, season: 'S2', date: 0 },
    player_stats: [{ username: 'Player 0 球', extension: '球'.repeat(10_000) }], edits: [{ extension: 'legacy'.repeat(5000) }], status: 'pending', submitted_by_account_id: fixtureUser, submitted_by: 'Player 0 球', submitted_at: new Date(index), reviewed_by: null, reviewed_at: null, rejection_reason: null }));
  const positionRequests = Array.from({ length: 105 }, (_, index) => ({ id: `p_${index}`, account_id: fixtureUser, username: 'Player 0 球', from_pos: 'CM', to_pos: 'GK', reason: '球'.repeat(2000), status: 'pending', reviewed_by: null, reviewed_at: null, created_at: new Date(index) }));
  const client = {
    account: { findMany: async () => accounts, findUnique: async (args: { where: { id?: string; username_lower?: string } }) => args.where.username_lower ? accounts.find(row => row.username.toLowerCase() === args.where.username_lower) ?? null : find(accounts, args)[0] ?? null,
      update: async (args: { where: { id: string }; data: object }) => { const row = find(accounts,args)[0]; if (row) Object.assign(row,args.data); return row; },
      updateManyAndReturn: async (args: { where: { id: string }; data: object }) => { const row = find(accounts,args)[0]; if (row) Object.assign(row,args.data); return row ? [row] : []; } },
    team: { findMany: async (args?: { where?: { id?: string } }) => find(teams, args),
      findUnique: async (args: { where: { id: string } }) => find(teams, args)[0] ?? null },
    teamJoinRequest: { findMany: async () => [] }, season: { findMany: async () => ['S1', 'S2', 'S3'].map(id => ({ id })) },
    teamSeason: { findMany: async () => teams.flatMap(team => ['S1', 'S2', 'S3'].map(season_id => ({ team_id: team.id, season_id }))) },
    news: { findMany: async () => news, findUnique: async (args: { where: { id: string } }) => find(news, args)[0] ?? null,
      updateManyAndReturn: async (args: { where: { id: string }; data: object }) => { const row = find(news, args)[0]; if (row) Object.assign(row, args.data); return row ? [row] : []; } },
    ruleSection: { findMany: async () => rules, findUnique: async (args: { where: { id: string } }) => find(rules, args)[0] ?? null },
    article: { findMany: async () => articles, findUnique: async (args: { where: { id?: string; slug?: string } }) => articles.find(row => row.id === args.where.id || row.slug === args.where.slug) ?? null },
    scheduledMatch: { findMany: async () => schedules, findUnique: async (args: { where: { id: string } }) => find(schedules, args)[0] ?? null },
    totwVotingPeriod: { findMany: async () => [period], findUnique: async () => period },
    setting: { findUnique: async (args: { where: { key: string } }) => ({ key: args.where.key, value: args.where.key === 'current_season' ? 'S2' : (args.where.key === 'season_champions' ? JSON.stringify(Object.fromEntries(Array.from({ length: 105 }, (_, index) => [`S${index}`, { winnerTeamId: 't_0', runnerUpTeamId: 't_1', setAt: index }]))) : null) }) },
  } as unknown as Database['client'];
  const db: Database = { client, close: async () => {}, execute: async () => 1, transaction: async work => work(db),
    query: async <T extends Row>(sql: Prisma.Sql) => {
      const text = sql.sql;
      let rows: unknown[] = [];
      if (text.includes('SELECT r.user_id::text')) rows = accounts.map(row => ({ userId: row.id, username: row.username, role: 'admin' }));
      else if (text.includes('SELECT * FROM asl.accounts')) rows = accounts.filter(row => row.id === sql.values[0]);
      else if (text.includes('FROM auth_gateway.user_roles')) rows = [{ role: 'super_admin' }];
      else if (text.includes('AS season_stats')) rows = accounts;
      else if (text.startsWith('WITH target AS')) { const after = Number(sql.values.at(-2)), count = Number(sql.values.at(-1)); rows = accounts[0]!.matches.slice(after, after + count).map((match, index) => ({ version: '1', match, ordinality: after + index + 1 })); }
      else if (text.includes('AS opponent')) rows = accounts[0]!.matches.map(match => ({ opponent: match.opponent, games: 1, w: 1, d: 0, l: 0, goals: 1, assists: 1, motm: 0 }));
      else if (text.includes('FROM asl.transfers')) rows = transfers;
      else if (text.includes('FROM asl.submissions')) rows = /WHERE id=/.test(text) ? submissions.filter(row => row.id === sql.values[0]) : submissions;
      else if (text.includes('asl.position_change_requests')) rows = positionRequests;
      else if (text.includes('FROM asl.totw_candidates')) rows = accounts.map(account => ({ username: account.username }));
      else if (text.includes('FROM asl.totw_winners')) rows = [];
      else if (text.includes('SELECT username FROM asl.accounts')) rows = [{ username: accounts[0]!.username }];
      return rows as T[];
    },
  };
  return { db, accounts, teams, news, rules, articles, schedules, transfers, period, submissions, positionRequests };
}
