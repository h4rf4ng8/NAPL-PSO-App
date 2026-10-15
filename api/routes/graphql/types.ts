import { GraphQLList, GraphQLNonNull, type GraphQLOutputType } from 'graphql';

export const nonNull = (type: GraphQLOutputType) => new GraphQLNonNull(type);
export const nonNullList = (type: GraphQLOutputType) => new GraphQLNonNull(new GraphQLList(nonNull(type)));
