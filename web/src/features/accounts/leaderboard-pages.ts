import type { LeaderboardQuery } from '../../api/generated/graphql';

// Concatenate the next page of leaderboard nodes onto the previous page while
// carrying forward the fresh pageInfo + totalCount from the newer page.
// Keeps the exact shape of LeaderboardQuery['leaderboard'] so Apollo 4's
// updateQuery overload accepts it without complaint.
export function mergeLeaderboardPages(
  before: LeaderboardQuery['leaderboard'],
  next: LeaderboardQuery['leaderboard'],
): LeaderboardQuery['leaderboard'] {
  return { ...next, nodes: [...before.nodes, ...next.nodes] };
}
