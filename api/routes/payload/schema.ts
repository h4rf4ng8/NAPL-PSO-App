import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql';
import { z } from 'zod';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull, nonNullList } from '../graphql/types.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { loadRankedAccounts, getCurrentAccount } from '../accounts/queries.js';
import { currentAccountDto, playerCard, playerSummary, trophySummary } from '../accounts/dto.js';
import { types } from '../accounts/schema.js';
import { actor, HttpError, isAdmin } from '../../plugins/auth/identity.js';
import { object, string } from '../../plugins/db/records.js';
import type { Row } from '../../plugins/db/client.js';
import { getSetting } from '../settings/queries.js';
import { listTeams } from '../teams/queries.js';
import { listNews } from '../content/queries.js';
import { listVotingPeriods, needVotingPeriod } from '../voting/queries.js';
import { loadTeamRecords } from '../matches/records.js';
import { pathSegment, bytes, detailUrl, page } from './page.js';

const population = (context: GraphQLContext) => read(context, 'payload-population', async () => {
  const [accounts, teams] = await Promise.all([loadRankedAccounts(context.db), listTeams(context.db, { id: context.request.identity?.id, admin: context.request.userRoles.length > 0 })]);
  const byId = new Map(teams.map(team => [team.id, { id: team.id, name: team.name, tag: team.tag, color: team.color,
    ownerUsername: team.ownerUsername, status: team.status, logoUrl: team.logoUrl, totw: team.totw, totwSetAt: team.totwSetAt }]));
  return accounts.map((account): Row => ({ ...account, team: byId.get(String(account.teamId)) ?? null }));
});
// eslint-disable-next-line unicorn/prefer-default-parameters -- GraphQL null also selects all-time statistics.
const seasonValue = (value: unknown) => z.string().min(1).max(160).parse(value ?? 'all');

export const PageInfo = new GraphQLObjectType({ name: 'PayloadPageInfo', fields: {
  endCursor: { type: GraphQLString }, hasNextPage: { type: nonNull(GraphQLBoolean) },
} });
const TeamIdentity = new GraphQLObjectType({ name: 'TeamIdentity', fields: {
  id: { type: nonNull(GraphQLID) }, name: { type: nonNull(GraphQLString) }, tag: { type: nonNull(GraphQLString) }, color: { type: GraphQLString },
  ownerUsername: { type: nonNull(GraphQLString) }, status: { type: nonNull(GraphQLString) }, logoUrl: { type: GraphQLString },
  totw: { type: nonNull(GraphQLBoolean) }, totwSetAt: { type: GraphQLFloat },
} });
const summaryFields = {
  id: { type: nonNull(GraphQLID) }, username: { type: nonNull(GraphQLString) }, position: { type: nonNull(GraphQLString) },
  teamId: { type: GraphQLID }, imageUrl: { type: GraphQLString }, country: { type: GraphQLString },
  stats: { type: nonNull(JSONScalar) }, ranking: { type: nonNull(types.Ranking) },
  team: { type: TeamIdentity },
};
const cardFields = { ...summaryFields,
  season: { type: nonNull(GraphQLString) }, cardStats: { type: nonNullList(types.CardStatCell) },
  totwUntil: { type: GraphQLFloat }, cheater: { type: nonNull(GraphQLBoolean) }, strikersId: { type: GraphQLString },
  steamUrl: { type: GraphQLString }, statsUrl: { type: nonNull(GraphQLString) }, createdAt: { type: GraphQLFloat },
  awardCount: { type: nonNull(GraphQLInt) }, championshipCount: { type: nonNull(GraphQLInt) },
  awardPreview: { type: nonNull(JSONScalar) }, championshipPreview: { type: nonNull(JSONScalar) },
  previewHasMore: { type: nonNull(GraphQLBoolean) },
};
const AccountSummary = new GraphQLObjectType({ name: 'AccountSummary', fields: summaryFields });
const AccountCard = new GraphQLObjectType({ name: 'AccountCard', fields: cardFields });
const CurrentAccountSummary = new GraphQLObjectType({ name: 'CurrentAccountSummary', fields: { ...cardFields,
  email: { type: GraphQLString }, pendingImageUrl: { type: GraphQLString }, roles: { type: nonNullList(GraphQLString) },
} });
const AccountSummaryPage = new GraphQLObjectType({ name: 'AccountSummaryPage', fields: {
  nodes: { type: nonNullList(AccountSummary) }, pageInfo: { type: nonNull(PageInfo) }, totalCount: { type: nonNull(GraphQLInt) },
} });
const AccountCardPage = new GraphQLObjectType({ name: 'AccountCardPage', fields: {
  nodes: { type: nonNullList(AccountCard) }, pageInfo: { type: nonNull(PageInfo) }, totalCount: { type: nonNull(GraphQLInt) },
} });
const ImportAccountSummary = new GraphQLObjectType({ name: 'ImportAccountSummary', fields: {
  id: { type: nonNull(GraphQLID) }, username: { type: nonNull(GraphQLString) }, strikersId: { type: GraphQLString },
  position: { type: nonNull(GraphQLString) }, teamId: { type: GraphQLID },
} });
const ImportAccountSummaryPage = new GraphQLObjectType({ name: 'ImportAccountSummaryPage', fields: {
  nodes: { type: nonNullList(ImportAccountSummary) }, pageInfo: { type: nonNull(PageInfo) }, totalCount: { type: nonNull(GraphQLInt) },
} });
const StringPage = new GraphQLObjectType({ name: 'StringPage', fields: {
  nodes: { type: nonNullList(GraphQLString) }, pageInfo: { type: nonNull(PageInfo) }, totalCount: { type: nonNull(GraphQLInt) },
  summaries: { type: nonNull(JSONScalar) },
} });
const JsonPage = new GraphQLObjectType({ name: 'JsonPage', fields: {
  nodes: { type: nonNullList(JSONScalar) }, pageInfo: { type: nonNull(PageInfo) }, totalCount: { type: nonNull(GraphQLInt) },
} });
const TeamSummary = new GraphQLObjectType({ name: 'TeamSummary', fields: {
  id: { type: nonNull(GraphQLID) }, name: { type: nonNull(GraphQLString) }, tag: { type: nonNull(GraphQLString) },
  color: { type: GraphQLString }, ownerUsername: { type: nonNull(GraphQLString) }, status: { type: nonNull(GraphQLString) },
  logoUrl: { type: GraphQLString }, totw: { type: nonNull(GraphQLBoolean) }, totwSetAt: { type: GraphQLFloat },
  createdAt: { type: GraphQLFloat }, reviewedAt: { type: GraphQLFloat }, reviewedBy: { type: GraphQLString },
  memberCount: { type: nonNull(GraphQLInt) }, invitationCount: { type: nonNull(GraphQLInt) }, seasonCount: { type: nonNull(GraphQLInt) },
  viewerInvitation: { type: GraphQLString },
} });
const TeamSummaryPage = new GraphQLObjectType({ name: 'TeamSummaryPage', fields: {
  nodes: { type: nonNullList(TeamSummary) }, pageInfo: { type: nonNull(PageInfo) }, totalCount: { type: nonNull(GraphQLInt) },
} });
const NewsHeadline = new GraphQLObjectType({ name: 'NewsHeadline', fields: {
  id: { type: nonNull(GraphQLID) }, title: { type: nonNull(GraphQLString) }, type: { type: nonNull(GraphQLString) },
  pinned: { type: nonNull(GraphQLBoolean) }, createdAt: { type: GraphQLFloat },
} });
const VotingPeriodSummary = new GraphQLObjectType({ name: 'VotingPeriodSummary', fields: {
  id: { type: nonNull(GraphQLID) }, season: { type: GraphQLString }, closesAt: { type: nonNull(GraphQLFloat) }, status: { type: nonNull(GraphQLString) },
} });
const LeagueOverview = new GraphQLObjectType({ name: 'LeagueOverview', fields: {
  season: { type: nonNull(GraphQLString) }, playerCount: { type: nonNull(GraphQLInt) }, activeTeamCount: { type: nonNull(GraphQLInt) },
  me: { type: CurrentAccountSummary }, tickerNews: { type: nonNullList(NewsHeadline) }, tickerHasMore: { type: nonNull(GraphQLBoolean) }, activeVotingPeriod: { type: VotingPeriodSummary },
} });
export const pageArgs = { first: { type: GraphQLInt, defaultValue: 10 }, after: { type: GraphQLString } };
const selectedSeason = { season: { type: GraphQLString, defaultValue: 'all' } };
const sortKeys = z.enum(['ovr', 'gp', 'g', 'a', 'pts', 'motm', 'tkl', 'pass', 'cs', 'dfl', 'catches', 'w', 'd', 'l']);
const statKeys = { gp: 'games', g: 'goals', a: 'assists', motm: 'motm', tkl: 'tackles', pass: 'passes', cs: 'cleanSheets', dfl: 'deflects', catches: 'catches', w: 'wins', d: 'draws', l: 'losses' } as const;


export const queryFields = {
  importAccountMatches: { type: nonNull(ImportAccountSummaryPage), args: { ...pageArgs, strikersIds: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) } },
    resolve: (_source: unknown, args: { strikersIds: string[]; first?: number; after?: string }, context: GraphQLContext) => read(context, 'import-accounts', async () => {
      actor(context.request);
      if (!isAdmin(context.request)) throw new HttpError(403, 'admin_required');
      const ids = z.array(z.string().min(1).max(160)).max(30).parse(args.strikersIds);
      const rows = await context.db.client.account.findMany({ where: { strikers_id: { in: ids } }, select: { id: true, username: true, strikers_id: true, position: true, team_id: true }, orderBy: [{ username: 'asc' }, { id: 'asc' }] });
      return page(rows.map(row => ({ id: row.id, username: row.username, strikersId: row.strikers_id, position: row.position, teamId: row.team_id })), `import-accounts:${JSON.stringify(ids)}`, args);
    }) },
  leagueOverview: { type: nonNull(LeagueOverview), args: selectedSeason,
    resolve: (_source: unknown, args: { season?: string }, context: GraphQLContext) => read(context, 'overview', async () => {
      const season = seasonValue(args.season);
      const accounts = await population(context);
      const [current, teams, news, periods, currentSeason] = await Promise.all([
        context.request.identity ? getCurrentAccount(context.db, context.request.identity.id, accounts) : null,
        listTeams(context.db, { id: context.request.identity?.id, admin: context.request.userRoles.length > 0 }),
        listNews(context.db), listVotingPeriods(context.db), getSetting(context.db, 'current_season'),
      ]);
      const me = currentAccountDto(current, context.request.userRoles);
      const active = periods.find(period => period.status === 'open' && (period.opensAt ?? Infinity) <= Date.now() && Date.now() < (period.closesAt ?? 0));
      const headlines = news.toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0));
      // Ticker is explicitly a bounded preview; the complete news collection has its own page route.
      const result = { season: currentSeason, playerCount: accounts.length, activeTeamCount: teams.filter(team => team.status === 'approved').length,
        me: me ? { ...playerCard(me, season), email: me.email, pendingImageUrl: me.pendingImageUrl, roles: me.roles } : null,
        tickerNews: [] as Array<{ id: string; title: string; type: string; pinned: boolean; createdAt: number | null }>, tickerHasMore: false,
        activeVotingPeriod: active ? { id: active.id, season: null, closesAt: active.closesAt, status: active.status } : null,
      };
      for (const row of headlines.slice(0, 3)) {
        result.tickerNews.push({ id: row.id, title: row.title ?? '', type: row.type, pinned: row.pinned, createdAt: row.created_at?.getTime() ?? null });
        if (bytes(result) > 8000) { result.tickerNews.pop(); break; }
      }
      result.tickerHasMore = result.tickerNews.length < headlines.length;
      return result;
    }) },
  leaderboard: { type: nonNull(AccountSummaryPage), args: { ...pageArgs, ...selectedSeason, position: { type: GraphQLString }, sortBy: { type: GraphQLString, defaultValue: 'ovr' }, sortDir: { type: GraphQLString, defaultValue: 'desc' } },
    resolve: (_source: unknown, args: { season?: string; position?: string; sortBy?: string; sortDir?: string; first?: number; after?: string }, context: GraphQLContext) => read(context, 'leaderboard', async () => {
      const season = seasonValue(args.season), sortBy = sortKeys.parse(args.sortBy ?? 'ovr'), direction = z.enum(['asc', 'desc']).parse(args.sortDir ?? 'desc');
      const accounts = await population(context);
      const rows = accounts.filter(row => !args.position || row.position === args.position).map(row => playerSummary(row, season));
      const value = (row: typeof rows[number]): number => sortBy === 'ovr' ? Number(object(row.ranking).score) : (sortBy === 'pts' ? row.stats.goals + row.stats.assists : row.stats[statKeys[sortBy]]);
      const sorted = rows.toSorted((a, b) => (value(a) - value(b)) * (direction === 'asc' ? 1 : -1) || String(a.username).localeCompare(String(b.username)) || String(a.id).localeCompare(String(b.id)));
      return page(sorted, JSON.stringify({ season, position: args.position, sortBy, direction }), args);
    }) },
  accountCard: { type: AccountCard, args: { id: { type: new GraphQLNonNull(GraphQLID) }, ...selectedSeason },
    resolve: (_source: unknown, args: { id: string; season?: string }, context: GraphQLContext) => read(context, 'account-card', async () => {
      const id = z.uuid().parse(args.id), season = seasonValue(args.season);
      const accounts = await population(context);
      const row = accounts.find(account => account.id === id);
      if (!row) return null;
      context.request.resource = { type: 'account', id: String(row.id) };
      return playerCard(row, season);
    }) },
  seasons: { type: nonNull(StringPage), args: pageArgs,
    resolve: (_source: unknown, args: { first?: number; after?: string }, context: GraphQLContext) => read(context, 'seasons', async () => {
      const current = string(await getSetting(context.db, 'current_season'));
      const seasons = new Set([current]);
      const registered = await context.db.client.season.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      for (const row of registered) seasons.add(row.id);
      const accounts = await population(context);
      for (const row of accounts) {
        const keys = Object.keys(object(row.seasonStats));
        for (const season of keys) if (season !== 'all') seasons.add(season);
      }
      const result = page([...seasons].toSorted((a, b) => b.localeCompare(a, undefined, { numeric: true })), 'seasons', args);
      return { ...result, summaries: result.nodes.map(season => {
        const games = accounts.map(row => Number(object(object(row.seasonStats)[season]).games ?? 0));
        return { games: games.reduce((total, value) => total + value, 0), players: games.filter(value => value > 0).length };
      }) };
    }) },
  accountAwards: { type: nonNull(JsonPage), args: { id: { type: new GraphQLNonNull(GraphQLID) }, ...pageArgs },
    resolve: (_source: unknown, args: { id: string; first?: number; after?: string }, context: GraphQLContext) => read(context, 'account-awards', async () => {
      const accounts = await population(context);
      const row = accounts.find(account => account.id === z.uuid().parse(args.id));
      if (!row) throw new HttpError(404, 'not_found');
      context.request.resource = { type: 'account', id: String(row.id) };
      return page((Array.isArray(row.awards) ? row.awards : []).map((value, index) => trophySummary(value, args.id, 'awards', index)), `awards:${args.id}`, args);
    }) },
  accountChampionships: { type: nonNull(JsonPage), args: { id: { type: new GraphQLNonNull(GraphQLID) }, ...pageArgs },
    resolve: (_source: unknown, args: { id: string; first?: number; after?: string }, context: GraphQLContext) => read(context, 'account-championships', async () => {
      const accounts = await population(context);
      const row = accounts.find(account => account.id === z.uuid().parse(args.id));
      if (!row) throw new HttpError(404, 'not_found');
      context.request.resource = { type: 'account', id: String(row.id) };
      return page((Array.isArray(row.championships) ? row.championships : []).map((value, index) => trophySummary(value, args.id, 'championships', index)), `championships:${args.id}`, args);
    }) },
  teamSummaries: { type: nonNull(TeamSummaryPage), args: { ...pageArgs, scope: { type: GraphQLString }, status: { type: GraphQLString }, search: { type: GraphQLString } },
    resolve: (_source: unknown, args: { first?: number; after?: string; scope?: string; status?: string; search?: string }, context: GraphQLContext) => read(context, 'team-summaries', async () => {
      const filters = z.object({ scope: z.enum(['mine']).nullish(), status: z.enum(['approved', 'pending', 'rejected']).nullish(), search: z.string().max(100).nullish() }).parse(args);
      if (filters.scope === 'mine') actor(context.request);
      const self = context.request.identity ? await context.db.client.account.findUnique({ where: { id: context.request.identity.id }, select: { username: true } }) : null;
      const teams = await listTeams(context.db, { id: context.request.identity?.id, admin: context.request.userRoles.length > 0 });
      const rows = teams.filter(team => (!filters.status || team.status === filters.status) && (!filters.search || `${team.name} ${team.tag}`.toLowerCase().includes(filters.search.toLowerCase()))
        && (filters.scope !== 'mine' || team.ownerUsername === self?.username || team.members.includes(self?.username ?? '') || team.invitations.some(invitation => invitation.username === self?.username)));
      return page(rows.map(team => ({ id: team.id, name: team.name, tag: team.tag, color: team.color, ownerUsername: team.ownerUsername,
        status: team.status, logoUrl: team.logoUrl, totw: team.totw, totwSetAt: team.totwSetAt, createdAt: team.createdAt,
        reviewedAt: team.reviewedAt, reviewedBy: team.reviewedBy, memberCount: team.members.length, invitationCount: team.invitations.length, seasonCount: team.seasons.length,
        viewerInvitation: team.invitations.find(invitation => invitation.username === self?.username)?.status ?? null,
      })), `teams:${context.request.identity?.id ?? 'anonymous'}:${JSON.stringify(filters)}`, args);
    }) },
  teamPlayers: { type: nonNull(AccountCardPage), args: { ...pageArgs, ...selectedSeason, teamId: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: (_source: unknown, args: { teamId: string; season?: string; first?: number; after?: string }, context: GraphQLContext) => read(context, 'team-players', async () => {
      const teams = await listTeams(context.db, { id: context.request.identity?.id, admin: context.request.userRoles.length > 0 });
      const team = teams.find(row => row.id === args.teamId);
      if (!team) throw new HttpError(404, 'not_found');
      context.request.resource = { type: 'team', id: team.id };
      const names = new Set(team.members), season = seasonValue(args.season);
      const accounts = await population(context);
      return page(accounts.filter(row => names.has(string(row.username))).map(row => playerCard(row, season)), `team-players:${team.id}:${season}`, args);
    }) },
  homeSummary: { type: nonNull(JSONScalar), resolve: (_source: unknown, _args: unknown, context: GraphQLContext) => read(context, 'home-summary', async () => {
    const accounts = await population(context), teams = await listTeams(context.db, { id: context.request.identity?.id, admin: context.request.userRoles.length > 0 });
    const topPlayers = accounts.filter(row => object(row.ranking).ranked).toSorted((a, b) => Number(object(b.ranking).score) - Number(object(a.ranking).score)).slice(0, 3)
      .map(row => ({ id: row.id, username: row.username, position: row.position, ranking: row.ranking, stats: { games: object(row.stats).games } }));
    return { topPlayers, playerCount: accounts.length, activeTeamCount: teams.filter(team => team.status === 'approved').length };
  }) },
  homeNews: { type: nonNull(JsonPage), args: { ...pageArgs, kind: { type: new GraphQLNonNull(GraphQLString) }, upcomingOnly: { type: GraphQLBoolean, defaultValue: false } },
    resolve: (_source: unknown, args: { kind: string; upcomingOnly?: boolean; first?: number; after?: string }, context: GraphQLContext) => read(context, 'home-news', async () => {
      const kind = z.enum(['announcement', 'matchup', 'result']).parse(args.kind);
      const news = await listNews(context.db);
      const rows = news.filter(row => row.type === kind && (!args.upcomingOnly || kind !== 'matchup' || (row.event_date?.getTime() ?? 0) >= Date.now()));
      const sorted = rows.toSorted((a, b) => kind === 'announcement' ? Number(b.pinned) - Number(a.pinned) || (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0)
        : ((a.event_date?.getTime() ?? 0) - (b.event_date?.getTime() ?? 0)) * (kind === 'matchup' ? 1 : -1));
      const teams = await listTeams(context.db, { id: context.request.identity?.id, admin: context.request.userRoles.length > 0 });
      const teamMap = new Map(teams.map(team => [team.id, { id: team.id, name: team.name, tag: team.tag, color: team.color }]));
      return page(sorted.map(row => ({ id: row.id, type: row.type, title: row.title ?? '', pinned: row.pinned,
        homeTeamId: row.home_team_id, awayTeamId: row.away_team_id, homeScore: row.home_score, awayScore: row.away_score,
        homeTeam: teamMap.get(row.home_team_id ?? '') ?? null, awayTeam: teamMap.get(row.away_team_id ?? '') ?? null,
        date: row.event_date?.getTime() ?? null, author: row.author ?? '', createdAt: row.created_at?.getTime() ?? null, autoFromSubmission: row.auto_from_submission,
        bodyUrl: `/api/news/${pathSegment(row.id)}/body`, notesUrl: `/api/news/${pathSegment(row.id)}/notes`,
      })), `home-news:${kind}:${Boolean(args.upcomingOnly)}`, args);
    }) },
  hallOfFame: { type: nonNull(JsonPage), args: { ...pageArgs, season: { type: GraphQLString }, awardId: { type: GraphQLString } },
    resolve: (_source: unknown, args: { first?: number; after?: string; season?: string; awardId?: string }, context: GraphQLContext) => read(context, 'hall-of-fame', async () => {
      const byAward = new Map<string, unknown>();
      const accounts = await population(context);
      for (const row of accounts) {
        const awards = Array.isArray(row.awards) ? row.awards : [];
        for (const [index, award] of awards.entries()) {
          const raw = object(award);
          if ((!args.season || raw.season === args.season) && (!args.awardId || raw.awardId === args.awardId)) {
            byAward.set(JSON.stringify([raw.season, raw.awardId]), { player: playerSummary(row), award: trophySummary(award, String(row.id), 'awards', index) });
          }
        }
      }
      // eslint-disable-next-line unicorn/prefer-iterator-to-array -- Iterator helpers are outside the configured ES2023 library.
      return page([...byAward.values()], JSON.stringify({ kind: 'hall-of-fame', season: args.season, awardId: args.awardId }), args);
    }) },
  decoratedPlayers: { type: nonNull(JsonPage), args: pageArgs,
    resolve: (_source: unknown, args: { first?: number; after?: string }, context: GraphQLContext) => read(context, 'decorated', async () => {
      const accounts = await population(context);
      const rows = accounts.filter(row => Array.isArray(row.awards) && row.awards.length > 0)
        .map(row => ({ player: playerSummary(row), count: (row.awards as unknown[]).length })).toSorted((a, b) => b.count - a.count);
      return page(rows, 'decorated', args);
    }) },
  seasonChampions: { type: nonNull(JsonPage), args: pageArgs,
    resolve: (_source: unknown, args: { first?: number; after?: string }, context: GraphQLContext) => read(context, 'season-champions', async () => {
      const [champions, teams] = await Promise.all([getSetting(context.db, 'season_champions'), listTeams(context.db, { id: context.request.identity?.id, admin: context.request.userRoles.length > 0 })]);
      const byId = new Map(teams.map(team => [team.id, { id: team.id, name: team.name }]));
      const rows = Object.entries(object(champions)).map(([season, value], index) => {
        const entry = object(value);
        return { season, winnerTeam: byId.get(string(entry.winnerTeamId)) ?? null, runnerUpTeam: byId.get(string(entry.runnerUpTeamId)) ?? null,
          detailUrl: detailUrl(`/api/settings/season_champions/fields/${index}`, champions) };
      }).toSorted((a, b) => b.season.localeCompare(a.season, undefined, { numeric: true }));
      return page(rows, 'season-champions', args);
    }) },
  standings: { type: nonNull(JsonPage), args: { ...pageArgs, ...selectedSeason },
    resolve: (_source: unknown, args: { season?: string; first?: number; after?: string }, context: GraphQLContext) => read(context, 'standings', async () => {
      const season = seasonValue(args.season);
      const [records, teams] = await Promise.all([loadTeamRecords(context.db), listTeams(context.db, { id: context.request.identity?.id, admin: context.request.userRoles.length > 0 })]);
      const rows = teams.filter(team => team.status === 'approved' && (season === 'all' || !team.seasons.includes(season))).map(team => {
        const record = records.find(row => row.teamId === team.id && row.season === season) ?? { teamId: team.id, season, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
        return { ...record, team: { id: team.id, name: team.name, tag: team.tag, color: team.color, ownerUsername: team.ownerUsername,
          status: team.status, logoUrl: team.logoUrl, totw: team.totw, totwSetAt: team.totwSetAt } };
      }).toSorted((a, b) => b.pts - a.pts || b.w - a.w || b.gd - a.gd || b.gf - a.gf || a.team.name.localeCompare(b.team.name) || a.team.id.localeCompare(b.team.id));
      return page(rows.map((row, index) => ({ ...row, rank: index + 1 })), `standings:${season}`, args);
    }) },
  votingCandidates: { type: nonNull(AccountSummaryPage), args: { ...pageArgs, periodId: { type: new GraphQLNonNull(GraphQLID) }, position: { type: GraphQLString } },
    resolve: (_source: unknown, args: { periodId: string; position?: string; first?: number; after?: string }, context: GraphQLContext) => read(context, 'voting-candidates', async () => {
      const period = await needVotingPeriod(context.db, args.periodId), candidates = new Set(period.eligible_players);
      const accounts = await population(context);
      const rows = accounts.filter(row => candidates.has(String(row.username)) && (!args.position || row.position === args.position)).map(row => playerSummary(row));
      return page(rows, `voting:${args.periodId}:${args.position ?? ''}`, args);
    }) },
};
