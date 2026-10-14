import { GraphQLID, GraphQLObjectType, GraphQLString } from 'graphql';
import { nonNull, nonNullList } from '../graphql/types.js';
import { resolvers } from './resolvers.js';

const Admin = new GraphQLObjectType({
  name: 'Admin',
  description: 'A role assignment readable only by super administrators.',
  fields: {
    userId: { type: nonNull(GraphQLID), description: 'Assigned account identifier.' },
    username: { type: nonNull(GraphQLString), description: 'Assigned account display name.' },
    role: { type: nonNull(GraphQLString), description: 'Assigned authorization role.' },
  },
});

export const queryFields = {
  admins: {
    type: nonNullList(Admin),
    description: 'Current role assignments, visible only to super administrators.',
    resolve: resolvers.Query.admins,
  },
};

export const types = { Admin };
