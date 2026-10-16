import { HttpError } from '../../plugins/auth/identity.js';
import { DEFAULT_POSITION_WEIGHTS } from '../accounts/ranking.js';
import type { SettingKey } from './queries.js';

export function settingDto(key: SettingKey, value: string | null): unknown {
  if (key === 'current_season') return value ?? 'S1';
  if (!value) return key === 'position_weights' ? DEFAULT_POSITION_WEIGHTS : {};
  try { return JSON.parse(value) as unknown; }
  catch { throw new HttpError(503, 'invalid_setting'); }
}
