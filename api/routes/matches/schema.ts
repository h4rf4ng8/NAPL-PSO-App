import { GraphQLNonNull } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { loadTeamRecords } from './records.js';

export const queryFields = {
  teamRecords: {
    type: new GraphQLNonNull(JSONScalar),
    description: 'Compact team records calculated from imported match history.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'team-records', () => loadTeamRecords(context.db)),
  },
};
