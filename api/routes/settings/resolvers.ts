import type { GraphQLContext } from '../graphql/context.js';
import { read } from '../graphql/context.js';
import { getSetting } from './queries.js';

export const resolvers = {
  Query: {
    season: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'season', () => getSetting(context.db, 'current_season')),
    weightings: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'weightings', () => getSetting(context.db, 'position_weights')),
  },
};
