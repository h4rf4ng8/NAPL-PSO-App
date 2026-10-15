import type { Database, Row } from '../../plugins/db/client.js';
import { list } from '../../plugins/db/records.js';

import { newsDto } from './dto.js';

export async function listNews(database: Database): Promise<Row[]> {
  const rows = await list(database, 'news');
  return rows.map(row => newsDto(row));
}
