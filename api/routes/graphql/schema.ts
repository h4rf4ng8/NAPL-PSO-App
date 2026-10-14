import { GraphQLObjectType, GraphQLSchema } from 'graphql';
import { queryFields as accountFields } from '../accounts/schema.js';
import { queryFields as adminFields } from '../admin/schema.js';
import { queryFields as contentFields } from '../content/schema.js';
import { queryFields as settingsFields } from '../settings/schema.js';
import { queryFields as teamFields } from '../teams/schema.js';
import { queryFields as matchFields } from '../matches/schema.js';
import { queryFields as votingFields } from '../voting/schema.js';

export const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      ...accountFields,
      ...teamFields,
      ...matchFields,
      ...contentFields,
      ...votingFields,
      ...settingsFields,
      ...adminFields,
    },
  }),
});
