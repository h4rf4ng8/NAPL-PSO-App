import test from 'node:test';
import assert from 'node:assert/strict';
import { VOTE_FIELDS, VOTE_POSITIONS } from '@napl/contracts/league';
import { choicesFromVotes, emptyVoteChoices, hasCompleteVote, tallyVotes, type VoteTally } from '../src/features/voting/voting-utils';
import type { Vote } from '../src/features/voting/models';

const vote = (position: string, username: string): Vote => ({
  id: `${position}-${username}`,
  periodId: 'period-1',
  voterUsername: 'voter',
  position,
  votedForUsername: username,
  votedAt: 0,
});

test('vote choices use shared fields and ignore legacy or other voters positions', () => {
  const choices = choicesFromVotes([
    { ...vote('GK', 'Keeper'), voterUsername: 'Player' },
    { ...vote('DEF', 'Defender'), voterUsername: 'Player' },
    { ...vote('cm', 'Midfielder'), voterUsername: 'Player' },
    { ...vote('obsolete', 'Ignored'), voterUsername: 'Player' },
    { ...vote('CM', 'Other'), voterUsername: 'Other' },
  ], 'player');
  const expected = emptyVoteChoices();
  expected.gk = 'Keeper';
  expected.def = 'Defender';
  expected.cm = 'Midfielder';

  assert.deepEqual(Object.keys(choices), VOTE_FIELDS.map(({ key }) => key));
  assert.deepEqual(choices, expected);
  assert.equal(hasCompleteVote(choices), false);

  for (const field of VOTE_FIELDS) choices[field.key] = 'Player';
  assert.equal(hasCompleteVote(choices), true);
});

test('tallyVotes counts shared positions, ignores unknown ones, and sorts ties by username', () => {
  const actual = tallyVotes([
    vote('GK', 'Zed'),
    vote('GK', 'Amy'),
    vote('GK', 'Amy'),
    vote('striker', 'Ignored'),
    vote('ST', 'Solo'),
  ]);
  const expected = Object.fromEntries(VOTE_POSITIONS.map(position => [position, []])) as VoteTally;
  expected.GK = [['Amy', 2], ['Zed', 1]];
  expected.ST = [['Solo', 1]];
  assert.deepEqual(actual, expected);
});
