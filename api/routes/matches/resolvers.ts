import type { GraphQLContext } from '../graphql/context.js';
import { read } from '../graphql/context.js';
import { loadTeamRecords } from './records.js';

export const resolvers = {
  Query: {
    teamRecords: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'team-records', () => loadTeamRecords(context.db)),
  },
};
