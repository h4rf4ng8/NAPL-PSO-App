import { GraphQLFloat, GraphQLID, GraphQLObjectType, GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull, nonNullList } from '../graphql/types.js';
import { resolvers } from './resolvers.js';

const VotingPeriod = new GraphQLObjectType({
  name: 'VotingPeriod',
  description: 'A public player of the week voting period.',
  fields: {
    id: { type: nonNull(GraphQLID), description: 'Stable voting period ID.' },
    opensAt: { type: nonNull(GraphQLFloat), description: 'Opening time in milliseconds.' },
    closesAt: { type: nonNull(GraphQLFloat), description: 'Closing time in milliseconds.' },
    status: { type: nonNull(GraphQLString), description: 'Voting period status.' },
    eligiblePlayers: { type: nonNullList(GraphQLString), description: 'Eligible player usernames.' },
    winners: { type: JSONScalar, description: 'Resolved vote winners, when available.' },
    createdBy: { type: nonNull(GraphQLString), description: 'Username that created the period.' },
    createdAt: { type: nonNull(GraphQLFloat), description: 'Creation time in milliseconds.' },
    resolvedAt: { type: GraphQLFloat, description: 'Resolution time in milliseconds.' },
  },
});

export const queryFields = {
  votingPeriods: {
    type: nonNullList(VotingPeriod),
    description: 'Public voting periods in storage order.',
    resolve: resolvers.Query.votingPeriods,
  },
};
