export const page = <T>(nodes: T[]) => ({ nodes, pageInfo: { endCursor: null, hasNextPage: false }, totalCount: nodes.length });
