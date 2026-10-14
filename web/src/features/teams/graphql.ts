import type { TeamFieldsFragment } from '../../api/generated/graphql';
import type { Team } from './models';

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (): never => { throw new Error('Invalid GraphQL team lineup data.'); };

export function mapTeam(row: TeamFieldsFragment): Team {
  if (!isRecord(row.lineup) || Object.values(row.lineup).some(value => typeof value !== 'string')) return invalid();
  return {
    ...row,
    color: row.color ?? '', description: row.description ?? '', createdAt: row.createdAt ?? 0,
    lineup: row.lineup as Record<string, string>,
  };
}
