import type { Row } from '../../plugins/db/client.js';
import { dto, string } from '../../plugins/db/records.js';

export function newsDto(row: Row): Row {
  const fields = ['id', 'type', 'title', 'body', 'pinned', 'home_team_id', 'away_team_id', 'home_score', 'away_score', 'event_date', 'notes', 'author', 'created_at', 'auto_from_submission'];
  const result = dto(Object.fromEntries(fields.map(key => [key, row[key]])));
  result.date = result.eventDate ?? null;
  delete result.eventDate;
  for (const key of ['title', 'body', 'author', 'notes']) result[key] = string(result[key]);
  return result;
}

export function ruleDto(row: Row): Row {
  const fields = ['id', 'title', 'body', 'sort_order', 'created_at', 'updated_at'];
  const result = dto(Object.fromEntries(fields.map(key => [key, row[key]])));
  return result;
}

export function articleDto(row: Row): Row {
  const fields = ['id', 'slug', 'title', 'cover_image_url', 'author', 'body', 'excerpt', 'published_at', 'updated_at'];
  const result = dto(Object.fromEntries(fields.map(key => [key, row[key]])));
  return result;
}
