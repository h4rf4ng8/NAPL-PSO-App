import { GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull } from '../graphql/types.js';
import { resolvers } from './resolvers.js';

export const queryFields = {
  season: {
    type: nonNull(GraphQLString),
    description: 'The current league season, defaulting to S1.',
    resolve: resolvers.Query.season,
  },
  weightings: {
    type: JSONScalar,
    description: 'Public position weightings, or null when unset.',
    resolve: resolvers.Query.weightings,
  },
};
