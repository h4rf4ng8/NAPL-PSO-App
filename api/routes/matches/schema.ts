import { GraphQLNonNull } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { resolvers } from './resolvers.js';

export const queryFields = {
  teamRecords: {
    type: new GraphQLNonNull(JSONScalar),
    description: 'Compact team records calculated from imported match history.',
    resolve: resolvers.Query.teamRecords,
  },
};
