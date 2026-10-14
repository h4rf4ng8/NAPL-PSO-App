import type { GraphQLContext } from '../graphql/context.js';
import { read } from '../graphql/context.js';
import { listAdmins } from './queries.js';
import { actor, HttpError, requireMember } from '../../plugins/auth/identity.js';

export const resolvers = {
  Query: {
    admins: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'admins', async () => {
        const identity = actor(context.request);
        await requireMember(context.db, identity.id);
        if (!context.request.userRoles.includes('super_admin')) throw new HttpError(403, 'admin_required');
        return listAdmins(context.db);
      }),
  },
};
