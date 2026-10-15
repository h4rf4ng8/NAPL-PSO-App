import type { Row } from '../../plugins/db/client.js';
import { dto } from '../../plugins/db/records.js';

export function accountDto(row: Row, privateFields = false): Row {
  const fields = ['id', 'username', 'position', 'team_id', 'image_url', 'country', 'stats', 'matches', 'awards', 'championships', 'totw_until', 'cheater', 'strikers_id', 'steam_url', 'created_at'];
  const result = dto(Object.fromEntries(fields.map(key => [key, row[key]])));
  if (privateFields) {
    result.email = row.email ?? null;
    result.pendingImageUrl = row.pending_image_url ?? null;
  }
  return result;
}
