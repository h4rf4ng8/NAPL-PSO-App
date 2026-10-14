import type { GraphQLContext } from '../graphql/context.js';
import { read } from '../graphql/context.js';
import { getCurrentAccount, listAccounts } from './queries.js';
import { accountIdSchema, accountMatches, accountOpponents } from './history.js';

export const resolvers = {
  Query: {
    accounts: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'accounts', () => listAccounts(context.db, context.request)),
    me: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'current-account', () => getCurrentAccount(context.db, context.request)),
    accountMatches: (_source: unknown, args: { id: string; first?: number; after?: string; season?: string; opponent?: string }, context: GraphQLContext) =>
      read(context, `account-matches:${args.id}:${args.after ?? ''}:${args.first ?? ''}:${args.season ?? ''}:${args.opponent ?? ''}`, () => accountMatches(context.db, args)),
    accountOpponents: (_source: unknown, args: { id: string }, context: GraphQLContext) =>
      read(context, `account-opponents:${args.id}`, async () => {
        const id = accountIdSchema.parse(args.id);
        return accountOpponents(context.db, id);
      }),
  },
};
