import type { GraphQLContext } from '../graphql/context.js';
import { read } from '../graphql/context.js';
import { listVotingPeriods } from './queries.js';

export const resolvers = {
  Query: {
    votingPeriods: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'votingPeriods', () => listVotingPeriods(context.db)),
  },
};
