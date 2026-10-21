import { z } from 'zod';
import type { Account, Setting, Team } from '../../generated/prisma/client.js';
import { Prisma, type Database } from '../../plugins/db/client.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { settingDto } from './dto.js';

export const settingKey = z.enum(['current_season', 'season_champions', 'position_weights']);
export type SettingKey = z.infer<typeof settingKey>;

export async function getSetting(database: Database, key: SettingKey): Promise<unknown> {
  const setting = await readSetting(database, key);
  return settingDto(key, setting?.value ?? null);
}

export async function readSetting(database: Database, key: SettingKey, lock = false): Promise<Setting | null> {
  // Return the locked row directly rather than adding a second read.
  if (!lock) return database.client.setting.findUnique({ where: { key } });
  const rows = await database.query<Setting>(Prisma.sql `SELECT key,value FROM asl.settings WHERE key=${key} FOR UPDATE`);
  return rows[0] ?? null;
}

export async function ensureSeason(database: Database, id: string): Promise<void> {
  await database.transaction(async tx => {
    const existing = await tx.client.season.findUnique({ where: { id } });
    if (existing) return;
    await tx.client.season.create({ data: { id } });
    const teams = await tx.client.team.findMany({ select: { id: true } });
    if (teams.length > 0) await tx.client.teamSeason.createMany({ data: teams.map(team => ({ team_id: team.id, season_id: id })) });
  });
}

export async function saveSetting(database: Database, key: SettingKey, value: string | null): Promise<void> {
  await database.transaction(async tx => {
    if (key === 'current_season' && value) await ensureSeason(tx, value);
    await tx.client.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  });
}

export async function championshipTeam(database: Database, id: string): Promise<Team> {
  const team = await database.client.team.findUnique({ where: { id } });
  if (!team) throw new HttpError(404, 'not_found');
  return team;
}

export async function lockChampionshipAccounts(database: Database): Promise<Pick<Account, 'id' | 'team_id' | 'championships'>[]> {
  // Award replacement must read and write each account while its row is locked.
  return database.query(Prisma.sql `SELECT id, team_id, championships FROM asl.accounts FOR UPDATE`);
}

export async function saveChampionships(database: Database, id: string, championships: Prisma.InputJsonValue[]): Promise<void> {
  await database.client.account.update({ where: { id }, data: { championships } });
}
