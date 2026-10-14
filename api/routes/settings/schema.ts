import { GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull } from '../graphql/types.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { getSetting } from './queries.js';

export const queryFields = {
  season: {
    type: nonNull(GraphQLString),
    description: 'The current league season, defaulting to S1.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'season', () => getSetting(context.db, 'current_season')),
  },
  weightings: {
    type: JSONScalar,
    description: 'Public position weightings, or null when unset.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'weightings', () => getSetting(context.db, 'position_weights')),
  },
};
