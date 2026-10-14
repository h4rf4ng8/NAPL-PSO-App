import type { GraphQLContext } from '../graphql/context.js';
import { read } from '../graphql/context.js';
import { listNews } from './queries.js';

export const resolvers = {
  Query: {
    news: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'news', () => listNews(context.db)),
  },
};
