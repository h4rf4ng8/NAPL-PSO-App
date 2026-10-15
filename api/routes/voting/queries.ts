import type { Database, Row } from '../../plugins/db/client.js';
import { list } from '../../plugins/db/records.js';

import { periodDto } from './dto.js';

export async function listVotingPeriods(database: Database): Promise<Row[]> {
  const rows = await list(database, 'totw_voting_periods');
  return rows.map(value => periodDto(value));
}
