import { TeamRecordsDocument } from '../../api/generated/graphql';
import { graphql } from '../../api/graphql';
import { teamRecordsSchema } from '@napl/contracts/matches';

export async function loadTeamRecords(force = false) {
  const data = await graphql(TeamRecordsDocument, {}, { force });
  const parsed = teamRecordsSchema.safeParse(data.teamRecords);
  if (!parsed.success) throw new Error('Invalid GraphQL team records data.');
  return parsed.data;
}
