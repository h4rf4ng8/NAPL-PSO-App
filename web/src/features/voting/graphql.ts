import type { VotingPeriodFieldsFragment } from '../../api/generated/graphql';
import type { VotingPeriod } from './models';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

export function mapVotingPeriod(row: VotingPeriodFieldsFragment): VotingPeriod {
  if (row.winners !== null && (!isRecord(row.winners) || Object.values(row.winners).some(value => !isString(value)))) {
    throw new Error('Invalid GraphQL voting winners data.');
  }
  return { ...row, winners: row.winners as Record<string, string> | null };
}
