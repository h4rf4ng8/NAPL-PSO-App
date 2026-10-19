import type { SeasonsQuery } from '../../api/generated/graphql';
export function mergeSeasonPages(before: SeasonsQuery['seasons'], next: SeasonsQuery['seasons']): SeasonsQuery['seasons'] {
  if (!Array.isArray(before.summaries) || !Array.isArray(next.summaries)) throw new TypeError('Invalid season summaries.');
  return { ...next, nodes: [...before.nodes, ...next.nodes], summaries: [...before.summaries, ...next.summaries] };
}
