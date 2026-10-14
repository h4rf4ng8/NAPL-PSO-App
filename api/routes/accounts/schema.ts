import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull, nonNullList } from '../graphql/types.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { getCurrentAccount, listAccounts } from './queries.js';
import { accountIdSchema, accountMatches, accountOpponents } from './history.js';

const Account = new GraphQLObjectType({
  name: 'Account',
  description: 'Public account profile and league statistics.',
  fields: {
    id: { type: nonNull(GraphQLID), description: 'Stable account identifier.' },
    username: { type: nonNull(GraphQLString), description: 'Public display name.' },
    position: { type: nonNull(GraphQLString), description: 'League position.' },
    teamId: { type: GraphQLID, description: 'Current team identifier, if assigned.' },
    imageUrl: { type: GraphQLString, description: 'Public profile image URL.' },
    country: { type: GraphQLString, description: 'Country code, if provided.' },
    stats: { type: nonNull(JSONScalar), description: 'Aggregate league statistics.' },
    seasonStats: { type: nonNull(JSONScalar), description: 'Statistics grouped by season, including all-time totals.' },
    awards: { type: nonNull(JSONScalar), description: 'Player awards.' },
    championships: { type: nonNull(JSONScalar), description: 'Team championship placements.' },
    totwUntil: { type: GraphQLFloat, description: 'Epoch milliseconds when the current selection expires.' },
    cheater: { type: nonNull(GraphQLBoolean), description: 'Whether the profile is marked as cheating.' },
    strikersId: { type: GraphQLString, description: 'Linked Strikers identifier.' },
    steamUrl: { type: GraphQLString, description: 'Linked Steam profile URL.' },
    createdAt: { type: GraphQLFloat, description: 'Creation time in epoch milliseconds.' },
  },
});

const CurrentAccount = new GraphQLObjectType({
  name: 'CurrentAccount',
  description: 'The authenticated viewer and their private account fields.',
  fields: {
    id: { type: nonNull(GraphQLID), description: 'Stable account identifier.' },
    username: { type: nonNull(GraphQLString), description: 'Public display name.' },
    position: { type: nonNull(GraphQLString), description: 'League position.' },
    teamId: { type: GraphQLID, description: 'Current team identifier, if assigned.' },
    imageUrl: { type: GraphQLString, description: 'Public profile image URL.' },
    pendingImageUrl: { type: GraphQLString, description: 'Pending image visible only to the account owner.' },
    country: { type: GraphQLString, description: 'Country code, if provided.' },
    email: { type: GraphQLString, description: 'Email visible only to the account owner.' },
    roles: { type: nonNullList(GraphQLString), description: 'Current server-verified roles.' },
    stats: { type: nonNull(JSONScalar), description: 'Aggregate league statistics.' },
    seasonStats: { type: nonNull(JSONScalar), description: 'Statistics grouped by season, including all-time totals.' },
    awards: { type: nonNull(JSONScalar), description: 'Player awards.' },
    championships: { type: nonNull(JSONScalar), description: 'Team championship placements.' },
    totwUntil: { type: GraphQLFloat, description: 'Epoch milliseconds when the current selection expires.' },
    cheater: { type: nonNull(GraphQLBoolean), description: 'Whether the profile is marked as cheating.' },
    strikersId: { type: GraphQLString, description: 'Linked Strikers identifier.' },
    steamUrl: { type: GraphQLString, description: 'Linked Steam profile URL.' },
    createdAt: { type: GraphQLFloat, description: 'Creation time in epoch milliseconds.' },
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
      read(context, 'accounts', () => listAccounts(context.db, context.request)),
  },
  me: {
    type: CurrentAccount,
    description: 'The current authenticated account, if provisioned.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'current-account', () => getCurrentAccount(context.db, context.request)),
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
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: (_source: unknown, args: { id: string }, context: GraphQLContext) =>
      read(context, `account-opponents:${args.id}`, async () => {
        const id = accountIdSchema.parse(args.id);
        return accountOpponents(context.db, id);
      }),
  },
};

export const types = { Account, CurrentAccount };
