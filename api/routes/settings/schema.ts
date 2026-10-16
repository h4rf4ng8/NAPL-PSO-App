import { GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull } from '../graphql/types.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { getSetting } from './queries.js';
import { DEFAULT_POSITION_WEIGHTS } from '../accounts/ranking.js';

export const queryFields = {
  season: {
    type: nonNull(GraphQLString),
    description: 'The current league season, defaulting to S1.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'season', () => getSetting(context.db, 'current_season')),
  },
  weightings: {
    type: JSONScalar,
    description: 'Public position weightings, using server defaults when unset.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'weightings', () => getSetting(context.db, 'position_weights')),
  },
  defaultPositionWeights: {
    type: nonNull(JSONScalar),
    description: 'Server default position weights for the settings reset action.',
    resolve: () => DEFAULT_POSITION_WEIGHTS,
  },
};
