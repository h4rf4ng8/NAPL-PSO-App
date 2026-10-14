import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull, nonNullList } from '../graphql/types.js';
import { resolvers } from './resolvers.js';

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
    resolve: resolvers.Query.accounts,
  },
  me: {
    type: CurrentAccount,
    description: 'The current authenticated account, if provisioned.',
    resolve: resolvers.Query.me,
  },
  accountMatches: {
    type: nonNull(AccountMatchPage),
    description: 'A bounded page of public account match history.',
    args: {
      id: { type: new GraphQLNonNull(GraphQLID) }, first: { type: GraphQLInt, defaultValue: 25 }, after: { type: GraphQLString },
      season: { type: GraphQLString }, opponent: { type: GraphQLString },
    },
    resolve: resolvers.Query.accountMatches,
  },
  accountOpponents: {
    type: nonNull(JSONScalar),
    description: 'Opponent totals for a public account.',
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: resolvers.Query.accountOpponents,
  },
};

export const types = { Account, CurrentAccount };
