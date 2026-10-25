import type { TeamSummariesQuery, TeamPlayersQuery } from '../../api/generated/graphql';

export function mergeTeamSummaryPages(
  before: TeamSummariesQuery['teamSummaries'],
  next: TeamSummariesQuery['teamSummaries'],
): TeamSummariesQuery['teamSummaries'] {
  return { ...next, nodes: [...before.nodes, ...next.nodes] };
}

export function mergeTeamPlayerPages(
  before: TeamPlayersQuery['teamPlayers'],
  next: TeamPlayersQuery['teamPlayers'],
): TeamPlayersQuery['teamPlayers'] {
  return { ...next, nodes: [...before.nodes, ...next.nodes] };
}
