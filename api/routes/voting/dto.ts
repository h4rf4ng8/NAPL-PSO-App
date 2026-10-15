import type { Row } from '../../plugins/db/client.js';
import { dto } from '../../plugins/db/records.js';

export function periodDto(row: Row): Row {
  const fields = ['id', 'opens_at', 'closes_at', 'status', 'eligible_players', 'winners', 'created_by', 'created_at', 'resolved_at'];
  const result = dto(Object.fromEntries(fields.map(key => [key, row[key]])));
  return result;
}
