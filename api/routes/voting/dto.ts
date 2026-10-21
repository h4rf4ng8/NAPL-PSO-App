import type { TotwVotingPeriod, TotwVote } from '../../generated/prisma/client.js';

export function periodDto(row: TotwVotingPeriod & { eligible_players: string[]; winners: unknown }) {
  return {
    id: row.id, opensAt: row.opens_at?.getTime() ?? null, closesAt: row.closes_at?.getTime() ?? null,
    status: row.status, eligiblePlayers: row.eligible_players, winners: row.winners,
    createdBy: row.created_by, createdAt: row.created_at?.getTime() ?? null, resolvedAt: row.resolved_at?.getTime() ?? null,
  };
}

export function voteDto(row: TotwVote & { voter_username: string; voted_for_username: string }) {
  return {
    id: row.id, periodId: row.period_id, voterUsername: row.voter_username,
    position: row.position, votedForUsername: row.voted_for_username, votedAt: row.voted_at?.getTime() ?? null,
  };
}
