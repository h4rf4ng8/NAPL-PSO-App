import { VOTE_FIELDS, VOTE_POSITIONS, type VoteKey, type VotePosition } from '@napl/contracts/league';
import type { Vote } from './models';
export type VoteChoices = Record<VoteKey, string>;
export type VoteTally = Record<VotePosition, [string, number][]>;

export function emptyVoteChoices(): VoteChoices {
  return Object.fromEntries(VOTE_FIELDS.map(({ key }) => [key, ''])) as VoteChoices;
}

export function choicesFromVotes(votes: Vote[], username: string): VoteChoices {
  const choices = emptyVoteChoices();
  for (const vote of votes) {
    if (vote.voterUsername.toLowerCase() !== username.toLowerCase()) continue;
    const field = VOTE_FIELDS.find(candidate => candidate.pos.toLowerCase() === vote.position.toLowerCase());
    if (field) choices[field.key] = vote.votedForUsername;
  }
  return choices;
}

export function hasCompleteVote(choices: VoteChoices): boolean {
  return VOTE_FIELDS.every(({ key }) => choices[key].trim().length > 0);
}

export function tallyVotes(votes: Vote[]): VoteTally {
  const counts = Object.fromEntries(VOTE_POSITIONS.map(position => [position, {}])) as Record<VotePosition, Record<string, number>>;
  for (const vote of votes) {
    if (!VOTE_POSITIONS.includes(vote.position as VotePosition)) continue;
    const position = vote.position as VotePosition;
    counts[position][vote.votedForUsername] = (counts[position][vote.votedForUsername] || 0) + 1;
  }
  const sortPlayers = (players: Record<string, number>): [string, number][] => {
    const sorted: [string, number][] = [];
    for (const entry of Object.entries(players)) {
      const insertAt = sorted.findIndex(([name, count]) =>
        count < entry[1] || (count === entry[1] && name.localeCompare(entry[0]) > 0),
      );
      sorted.splice(insertAt === -1 ? sorted.length : insertAt, 0, entry);
    }
    return sorted;
  };
  return Object.fromEntries(VOTE_POSITIONS.map(position => [position, sortPlayers(counts[position])])) as VoteTally;
}
