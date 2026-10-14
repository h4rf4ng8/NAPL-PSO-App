import type { GraphQLContext } from '../graphql/context.js';
import { read } from '../graphql/context.js';
import { listTeams } from './queries.js';

export const resolvers = {
  Query: {
    teams: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'teams', () => listTeams(context.db, context.request)),
  },
};
