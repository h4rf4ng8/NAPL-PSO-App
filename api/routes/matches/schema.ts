import { GraphQLInt, GraphQLNonNull, GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { loadTeamRecords } from './records.js';
import { page } from '../payload/page.js';

export const queryFields = {
  teamRecords: {
    type: new GraphQLNonNull(JSONScalar),
    description: 'Compact team records calculated from imported match history.',
    args: { season: { type: GraphQLString, defaultValue: 'all' }, first: { type: GraphQLInt, defaultValue: 10 }, after: { type: GraphQLString } },
    resolve: (_source: unknown, args: { season?: string; first?: number; after?: string }, context: GraphQLContext) =>
      read(context, 'team-records', async () => {
        const records = await loadTeamRecords(context.db);
        return page(records.filter(row => row.season === (args.season ?? 'all')), `team-records:${args.season ?? 'all'}`, args);
      }),
  },
};
