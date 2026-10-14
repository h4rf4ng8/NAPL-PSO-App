import { z } from 'zod';
import type { Database } from '../../plugins/db/client.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { get, string } from '../../plugins/db/records.js';

export const settingKey = z.enum(['current_season', 'season_champions', 'position_weights']);
export type SettingKey = z.infer<typeof settingKey>;

export async function getSetting(database: Database, key: SettingKey): Promise<unknown> {
  const row = await get(database, 'settings', 'key', key);
  if (key === 'current_season')
    return row?.value ?? 'S1';
  if (!row?.value)
    return key === 'position_weights' ? null : {};
  try {
    return JSON.parse(string(row.value)) as unknown;
  }
  catch {
    throw new HttpError(503, 'invalid_setting');
  }
}
