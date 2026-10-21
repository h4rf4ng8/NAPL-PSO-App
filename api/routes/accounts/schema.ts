import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull, nonNullList } from '../graphql/types.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { getCurrentAccount, listAccounts, loadRankedAccounts } from './queries.js';
import { currentAccountDto } from './dto.js';
import { actor, isAdmin } from '../../plugins/auth/identity.js';
import { accountIdSchema, accountMatches, accountOpponents } from './history.js';
import { POS } from '@napl/contracts/league';
import { calculateCardStats } from './ranking.js';
import { getSetting } from '../settings/queries.js';
import { detailUrl, page } from '../payload/page.js';

const accountPopulation = (context: GraphQLContext) => read(context, 'account-population', async () =>
  loadRankedAccounts(context.db, await read(context, 'weightings', () => getSetting(context.db, 'position_weights'))));

const Ranking = new GraphQLObjectType({
  name: 'AccountRanking',
  fields: {
    score: { type: nonNull(GraphQLFloat) }, percentile: { type: nonNull(GraphQLFloat) },
    ranked: { type: nonNull(GraphQLBoolean) }, gamesPlayed: { type: nonNull(GraphQLInt) },
    tier: { type: nonNull(GraphQLString) },
  },
});
const CardStatCell = new GraphQLObjectType({
  name: 'AccountCardStatCell', fields: { label: { type: nonNull(GraphQLString) }, value: { type: nonNull(GraphQLString) } },
});
const CardStatSeason = new GraphQLObjectType({
  name: 'AccountCardStatSeason', fields: {
    season: { type: GraphQLString }, cells: { type: nonNullList(CardStatCell) },
  },
});

const publicAccountFields = {
  id: { type: nonNull(GraphQLID), description: 'Stable account identifier.' },
  username: { type: nonNull(GraphQLString), description: 'Public display name.' },
  position: { type: nonNull(GraphQLString), description: 'League position.' },
  teamId: { type: GraphQLID, description: 'Current team identifier, if assigned.' },
  imageUrl: { type: GraphQLString, description: 'Public profile image URL.' },
  country: { type: GraphQLString, description: 'Country code, if provided.' },
  stats: { type: nonNull(JSONScalar), description: 'Aggregate league statistics.' },
  seasonStats: { type: nonNull(JSONScalar), description: 'Statistics grouped by season, including all-time totals.' },
  ranking: { type: nonNull(Ranking), description: 'Server-calculated position-relative player rating.' },
  cardStats: { type: nonNullList(CardStatSeason), description: 'Formatted player card statistics by season.' },
  awards: { type: nonNull(JSONScalar), description: 'Player awards.' },
  championships: { type: nonNull(JSONScalar), description: 'Team championship placements.' },
  totwUntil: { type: GraphQLFloat, description: 'Epoch milliseconds when the current selection expires.' },
  cheater: { type: nonNull(GraphQLBoolean), description: 'Whether the profile is marked as cheating.' },
  strikersId: { type: GraphQLString, description: 'Linked Strikers identifier.' },
  steamUrl: { type: GraphQLString, description: 'Linked Steam profile URL.' },
  createdAt: { type: GraphQLFloat, description: 'Creation time in epoch milliseconds.' },
};

const Account = new GraphQLObjectType({
  name: 'Account',
  description: 'Public account profile and league statistics.',
  fields: publicAccountFields,
});

const previews = [
  { username: 'Rookie', position: POS.ST, score: 66, percentile: 0.43333333333333335, tier: 'BRONZE', description: 'Bottom 40% of position', stats: { games: 15, wins: 4, draws: 3, losses: 8, goals: 3, assists: 2, passes: 18, tackles: 12, deflects: 0, cleanSheets: 1, catches: 0, motm: 0 }, awards: [] },
  { username: 'Solid', position: POS.CM, score: 66, percentile: 0.43333333333333335, tier: 'SILVER', description: 'Next 30% (40th–70th %ile)', stats: { games: 15, wins: 7, draws: 3, losses: 5, goals: 8, assists: 6, passes: 24, tackles: 22, deflects: 0, cleanSheets: 2, catches: 0, motm: 0 }, awards: [] },
  { username: 'Vet', position: POS.DEF, score: 79, percentile: 0.65, tier: 'GOLD', description: 'Country flag shows on the card', stats: { games: 15, wins: 9, draws: 3, losses: 3, goals: 18, assists: 11, passes: 32, tackles: 38, deflects: 0, cleanSheets: 4, catches: 0, motm: 0 }, awards: [], country: 'Canada' },
  { username: 'Champion', position: POS.ST, score: 88, percentile: 0.8, tier: 'DIAMOND', description: 'Award winners get a black name bar', stats: { games: 15, wins: 12, draws: 2, losses: 1, goals: 38, assists: 22, passes: 36, tackles: 22, deflects: 0, cleanSheets: 0, catches: 0, motm: 0 }, awards: [{ awardId: 'striker', season: 'S1', assignedBy: 'admin', assignedAt: 0 }] },
  { username: 'Decorated', position: POS.CM, score: 66, percentile: 0.43333333333333335, tier: 'SILVER', description: 'Black name bar shows on any tier', stats: { games: 15, wins: 7, draws: 3, losses: 5, goals: 8, assists: 6, passes: 24, tackles: 22, deflects: 0, cleanSheets: 2, catches: 0, motm: 0 }, awards: [{ awardId: 'playmaker', season: 'S1', assignedBy: 'admin', assignedAt: 0 }] },
].map((sample, index) => {
  const account = {
    id: `preview-${index}`, username: sample.username, position: sample.position, teamId: null, imageUrl: null,
    country: 'country' in sample ? sample.country : null, stats: sample.stats, seasonStats: { all: sample.stats },
    awards: sample.awards, championships: [], totwUntil: null, cheater: false, strikersId: null, steamUrl: null, createdAt: 0,
    ranking: { score: sample.score, percentile: sample.percentile, ranked: true, gamesPlayed: 15, tier: sample.tier },
    cardStats: [],
  };
  return { label: sample.tier + (sample.awards.length > 0 ? ' + AWARD' : ''), description: sample.description, account: { ...account, cardStats: calculateCardStats(account) } };
});
const AccountCardPreview = new GraphQLObjectType({
  name: 'AccountCardPreview', fields: {
    label: { type: nonNull(GraphQLString) }, description: { type: nonNull(GraphQLString) }, account: { type: nonNull(Account) },
  },
});

const CurrentAccount = new GraphQLObjectType({
  name: 'CurrentAccount',
  description: 'The authenticated viewer and their private account fields.',
  fields: {
    ...publicAccountFields,
    pendingImageUrl: { type: GraphQLString, description: 'Pending image visible only to the account owner.' },
    email: { type: GraphQLString, description: 'Email visible only to the account owner.' },
    roles: { type: nonNullList(GraphQLString), description: 'Current server-verified roles.' },
  },
});

const AccountMatchPageInfo = new GraphQLObjectType({
  name: 'AccountMatchPageInfo',
  fields: {
    endCursor: { type: GraphQLString },
    hasNextPage: { type: nonNull(GraphQLBoolean) },
  },
});

const AccountMatchPage = new GraphQLObjectType({
  name: 'AccountMatchPage',
  fields: {
    nodes: { type: nonNullList(JSONScalar) },
    pageInfo: { type: nonNull(AccountMatchPageInfo) },
  },
});

export const queryFields = {
  accounts: {
    type: nonNullList(Account),
    description: 'Public account profiles.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'accounts', async () => listAccounts(context.db, isAdmin(context.request), await accountPopulation(context))),
  },
  me: {
    type: CurrentAccount,
    description: 'The current authenticated account, if provisioned.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'current-account', async () => {
        const accounts = context.request.identity ? await accountPopulation(context) : undefined;
        return currentAccountDto(await getCurrentAccount(context.db, actor(context.request).id, accounts), context.request.userRoles);
      }),
  },
  accountCardPreviews: {
    type: nonNullList(AccountCardPreview), description: 'Sample player cards with server-computed rating and statistics.',
    resolve: () => previews,
  },
  accountMatches: {
    type: nonNull(AccountMatchPage),
    description: 'A bounded page of public account match history.',
    args: {
      id: { type: new GraphQLNonNull(GraphQLID) }, first: { type: GraphQLInt, defaultValue: 25 }, after: { type: GraphQLString },
      season: { type: GraphQLString }, opponent: { type: GraphQLString },
    },
    resolve: (_source: unknown, args: { id: string; first?: number; after?: string; season?: string; opponent?: string }, context: GraphQLContext) =>
      read(context, `account-matches:${args.id}:${args.after ?? ''}:${args.first ?? ''}:${args.season ?? ''}:${args.opponent ?? ''}`, () => accountMatches(context.db, args)),
  },
  accountOpponents: {
    type: nonNull(JSONScalar),
    description: 'Opponent totals for a public account.',
    args: { id: { type: new GraphQLNonNull(GraphQLID) }, first: { type: GraphQLInt, defaultValue: 10 }, after: { type: GraphQLString } },
    resolve: (_source: unknown, args: { id: string; first?: number; after?: string }, context: GraphQLContext) =>
      read(context, `account-opponents:${args.id}`, async () => {
        const id = accountIdSchema.parse(args.id);
        const rows = await accountOpponents(context.db, id);
        return page(rows.map((row, index) => ({ ...row, opponent: row.opponent.slice(0, 160), previewTruncated: row.opponent.length > 160,
          nameUrl: detailUrl(`/api/accounts/${id}/opponents/${index}/name`, row.opponent) })), `opponents:${id}`, args);
      }),
  },
};

export const types = { Account, CurrentAccount, Ranking, CardStatCell };
