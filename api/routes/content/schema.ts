import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLObjectType, GraphQLString } from 'graphql';
import { nonNull, nonNullList } from '../graphql/types.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { listNews } from './queries.js';

const News = new GraphQLObjectType({
  name: 'News',
  description: 'A public league news item.',
  fields: {
    id: { type: nonNull(GraphQLID), description: 'Stable news item ID.' },
    type: { type: nonNull(GraphQLString), description: 'News item category.' },
    title: { type: nonNull(GraphQLString), description: 'Headline.' },
    body: { type: nonNull(GraphQLString), description: 'News text.' },
    pinned: { type: nonNull(GraphQLBoolean), description: 'Whether the item is pinned.' },
    homeTeamId: { type: GraphQLID, description: 'Home team ID, when applicable.' },
    awayTeamId: { type: GraphQLID, description: 'Away team ID, when applicable.' },
    homeScore: { type: GraphQLFloat, description: 'Home score, when applicable.' },
    awayScore: { type: GraphQLFloat, description: 'Away score, when applicable.' },
    date: { type: GraphQLFloat, description: 'Event time in milliseconds, when applicable.' },
    notes: { type: GraphQLString, description: 'Additional match notes.' },
    author: { type: nonNull(GraphQLString), description: 'Username that created the item.' },
    createdAt: { type: GraphQLFloat, description: 'Creation time in milliseconds.' },
    autoFromSubmission: { type: GraphQLID, description: 'Source submission ID, when generated automatically.' },
  },
});

export const queryFields = {
  news: {
    type: nonNullList(News),
    description: 'Public news items in storage order.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'news', () => listNews(context.db)),
  },
};
