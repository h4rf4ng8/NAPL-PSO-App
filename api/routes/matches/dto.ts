import type { Row } from '../../plugins/db/client.js';
import { dto } from '../../plugins/db/records.js';

export function scheduleDto(row: Row): Row {
  const fields = ['id', 'season', 'week', 'home_team_id', 'away_team_id', 'scheduled_date', 'stream_url', 'match_type', 'playoff_round', 'status', 'home_score', 'away_score', 'linked_match_id', 'notes', 'created_at', 'updated_at'];
  const result = dto(Object.fromEntries(fields.map(key => [key, row[key]])));
  return result;
}
