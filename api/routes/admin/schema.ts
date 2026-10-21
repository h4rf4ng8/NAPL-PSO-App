import { GraphQLID, GraphQLObjectType, GraphQLString } from 'graphql';
import { nonNull, nonNullList } from '../graphql/types.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { listAdmins } from './queries.js';
import { actor, HttpError } from '../../plugins/auth/identity.js';

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
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'admins', async () => {
        actor(context.request);
        if (!context.request.userRoles.includes('super_admin')) throw new HttpError(403, 'admin_required');
        return listAdmins(context.db);
      }),
  },
};

export const types = { Admin };
