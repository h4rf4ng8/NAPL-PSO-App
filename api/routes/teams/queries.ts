/* eslint-disable unicorn/prefer-structured-clone -- JSON serialization must match stored JSON, including omitted undefined fields. */
import type { z } from 'zod';
import type { teamPatch } from '@napl/contracts';
import type { Account, Team } from '../../generated/prisma/client.js';
import { Prisma, type Database, type Row } from '../../plugins/db/client.js';
import { array, object, string, isCanonicalUuid } from '../../plugins/db/records.js';
import { teamDto } from './dto.js';
import { HttpError } from '../../plugins/auth/identity.js';

const same = (a: unknown, b: unknown) => string(a).toLowerCase() === string(b).toLowerCase();
const invited = (team: Team, name: unknown) => Boolean(name) && array(team.pending_members).some(entry => same(typeof entry === 'string' ? entry : object(entry).username, name));

export async function listTeams(database: Database, viewer: { username?: string; admin: boolean }) {
  const rows = await database.client.team.findMany();
  // Keep JS case folding and legacy string/object invitations, including declined ones.
  return rows.filter(row => row.status === 'approved' || viewer.admin || same(row.owner_username, viewer.username) || invited(row, viewer.username)).map(row => teamDto(row));
}

export async function getTeam(database: Database, id: string, lock = false): Promise<Team | null> {
  // Prisma has no row-lock API; roster/review mutations must keep their lock.
  if (!lock) return database.client.team.findUnique({ where: { id } });
  const rows = await database.query<Team>(Prisma.sql`SELECT * FROM public.teams WHERE id=${id} FOR UPDATE`);
  return rows[0] ?? null;
}
export async function needTeam(database: Database, id: string, lock = false): Promise<Team> {
  const team = await getTeam(database, id, lock);
  if (!team) throw new HttpError(404, 'not_found');
  return team;
}
export async function getAccount(database: Database, id: string, lock = false): Promise<Account | null> {
  if (!isCanonicalUuid(id)) return null;
  // Keep the account locked through roster/account/transfer writes.
  if (!lock) return database.client.account.findUnique({ where: { id } });
  const rows = await database.query<Account>(Prisma.sql`SELECT * FROM public.accounts WHERE id::text=${id} FOR UPDATE`);
  return rows[0] ?? null;
}
export async function needAccount(database: Database, id: string, lock = false): Promise<Account> {
  const account = await getAccount(database, id, lock);
  if (!account) throw new HttpError(404, 'not_found');
  return account;
}
export async function findAccount(database: Database, username_lower: string, lock = false): Promise<Account | null> {
  if (!lock) return database.client.account.findUnique({ where: { username_lower } });
  const rows = await database.query<Account>(Prisma.sql`SELECT * FROM public.accounts WHERE username_lower=${username_lower} FOR UPDATE`);
  return rows[0] ?? null;
}
export async function hasOwnedTeam(database: Database, name: string): Promise<boolean> {
  // LOWER equality preserves literal %/_ names; Prisma's insensitive filter uses ILIKE.
  const rows = await database.query<{ id: string }>(Prisma.sql`SELECT id FROM public.teams WHERE lower(owner_username)=lower(${name}) AND status IN ('pending','approved')`);
  return rows.length > 0;
}
export function teamFields(input: z.infer<typeof teamPatch>) {
  return {
    name: input.name, tag: input.tag, color: input.color, description: input.description,
    logo_url: input.logoUrl, seasons: input.seasons, formation: input.formation, lineup: input.lineup,
    totw: input.totw, totw_set_at: input.totwSetAt === undefined ? undefined : (input.totwSetAt === null ? null : new Date(input.totwSetAt)),
  };
}
export function createTeam(database: Database, data: Prisma.TeamCreateInput): Promise<Team> {
  return database.client.team.create({ data });
}
export function updateTeam(database: Database, id: string, data: Omit<Prisma.TeamUpdateInput, 'members' | 'pending_members' | 'lineup'> & { members?: unknown[]; pending_members?: Row[]; lineup?: Row }): Promise<Team> {
  // Match the old JSON.stringify storage semantics for legacy JSON containing undefined.
  return database.client.team.update({ where: { id }, data: {
    ...data,
    members: data.members === undefined ? undefined : JSON.parse(JSON.stringify(data.members)) as Prisma.InputJsonValue,
    pending_members: data.pending_members === undefined ? undefined : JSON.parse(JSON.stringify(data.pending_members)) as Prisma.InputJsonValue,
    lineup: data.lineup === undefined ? undefined : JSON.parse(JSON.stringify(data.lineup)) as Prisma.InputJsonValue,
  } });
}
export async function removeTeam(database: Database, id: string): Promise<void> {
  await database.client.team.deleteMany({ where: { id } });
}
export function teamAccounts(database: Database, id: string): Promise<Account[]> {
  // Lock every affected account before deleting its team.
  return database.query<Account>(Prisma.sql`SELECT * FROM public.accounts WHERE team_id=${id} FOR UPDATE`);
}
export function updateAccountTeam(database: Database, id: string, team_id: string | null): Promise<Account> {
  return database.client.account.update({ where: { id }, data: { team_id } });
}
export async function currentSeason(database: Database): Promise<string> {
  const setting = await database.client.setting.findUnique({ where: { key: 'current_season' } });
  return setting?.value ?? 'S1';
}
export function createTransfer(database: Database, data: Prisma.TransferCreateInput) {
  return database.client.transfer.create({ data });
}
