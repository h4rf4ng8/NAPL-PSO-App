import { GraphQLScalarType, valueFromASTUntyped } from 'graphql';

export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  serialize: value => value,
  parseValue: value => value,
  parseLiteral: (node, variables) => valueFromASTUntyped(node, variables),
});
