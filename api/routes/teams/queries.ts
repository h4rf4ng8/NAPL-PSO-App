import type { z } from 'zod';
import type { teamPatch } from '@napl/contracts';
import type { Account, Team } from '../../generated/prisma/client.js';
import { Prisma, type Database, type Row } from '../../plugins/db/client.js';
import { isCanonicalUuid } from '../../plugins/db/records.js';
import { teamDto, type TeamRecord } from './dto.js';
import { ensureSeason } from '../settings/queries.js';
import { HttpError } from '../../plugins/auth/identity.js';

async function teamRecords(database: Database, teams: Team[]): Promise<TeamRecord[]> {
  const [accounts, requests, seasons, participation] = await Promise.all([
    database.client.account.findMany({ select: { id: true, username: true, team_id: true } }),
    database.client.teamJoinRequest.findMany({ where: { team_id: { in: teams.map(team => team.id) } }, orderBy: { created_at: 'asc' } }),
    database.client.season.findMany(), database.client.teamSeason.findMany({ where: { team_id: { in: teams.map(team => team.id) } } }),
  ]);
  const byId = new Map(accounts.map(account => [account.id, account]));
  return teams.map(team => ({ ...team, owner_username: byId.get(team.owner_account_id)?.username ?? '',
    members: accounts.filter(account => account.team_id === team.id).map(account => account.username),
    pending_members: requests.filter(request => request.team_id === team.id).map(request => ({ accountId: request.account_id, username: byId.get(request.account_id)?.username ?? '', status: request.status, respondedAt: request.reviewed_at?.getTime() ?? null })),
    seasons: seasons.filter(season => participation.every(entry => entry.team_id !== team.id || entry.season_id !== season.id)).map(season => season.id),
  }));
}

export async function listTeams(database: Database, viewer: { id?: string; admin: boolean }) {
  const rows = await teamRecords(database, await database.client.team.findMany());
  // Invitations remain visible after a response so applicants can see the review.
  return rows.filter(row => row.status === 'approved' || viewer.admin || row.owner_account_id === viewer.id || row.pending_members.some(invitation => invitation.accountId === viewer.id)).map(row => teamDto(row));
}

export async function getTeam(database: Database, id: string, lock = false): Promise<TeamRecord | null> {
  // Prisma has no row-lock API; roster/review mutations must keep their lock.
  const rows = lock ? await database.query<Team>(Prisma.sql`SELECT * FROM asl.teams WHERE id=${id} FOR UPDATE`) : await database.client.team.findMany({ where: { id } });
  const records = await teamRecords(database, rows);
  return records[0] ?? null;
}
export async function needTeam(database: Database, id: string, lock = false): Promise<TeamRecord> {
  const team = await getTeam(database, id, lock);
  if (!team) throw new HttpError(404, 'not_found');
  return team;
}
export async function getAccount(database: Database, id: string, lock = false): Promise<Account | null> {
  if (!isCanonicalUuid(id)) return null;
  // Keep the account locked through roster/account/transfer writes.
  if (!lock) return database.client.account.findUnique({ where: { id } });
  const rows = await database.query<Account>(Prisma.sql`SELECT * FROM asl.accounts WHERE id::text=${id} FOR UPDATE`);
  return rows[0] ?? null;
}
export async function needAccount(database: Database, id: string, lock = false): Promise<Account> {
  const account = await getAccount(database, id, lock);
  if (!account) throw new HttpError(404, 'not_found');
  return account;
}
export async function findAccount(database: Database, username_lower: string, lock = false): Promise<Account | null> {
  if (!lock) return database.client.account.findUnique({ where: { username_lower } });
  const rows = await database.query<Account>(Prisma.sql`SELECT * FROM asl.accounts WHERE username_lower=${username_lower} FOR UPDATE`);
  return rows[0] ?? null;
}
export async function hasOwnedTeam(database: Database, accountId: string): Promise<boolean> {
  const rows = await database.query<{ id: string }>(Prisma.sql`SELECT id FROM asl.teams WHERE owner_account_id=${accountId}::uuid AND status IN ('pending','approved')`);
  return rows.length > 0;
}
export function teamFields(input: z.infer<typeof teamPatch>) {
  return {
    name: input.name, tag: input.tag, color: input.color, description: input.description,
    logo_url: input.logoUrl, formation: input.formation, lineup: input.lineup,
    totw: input.totw, totw_set_at: input.totwSetAt === undefined ? undefined : (input.totwSetAt === null ? null : new Date(input.totwSetAt)),
  };
}
export async function createTeam(database: Database, data: Prisma.TeamUncheckedCreateInput): Promise<TeamRecord> {
  const row = await database.client.team.create({ data });
  return needTeam(database, row.id);
}
export async function updateTeam(database: Database, id: string, data: Omit<Prisma.TeamUncheckedUpdateInput, 'lineup'> & { lineup?: Row }): Promise<TeamRecord> {
  // JSON serialization preserves stored JSON semantics for undefined lineup slots.
  // eslint-disable-next-line unicorn/prefer-structured-clone
  await database.client.team.update({ where: { id }, data: { ...data, lineup: data.lineup === undefined ? undefined : JSON.parse(JSON.stringify(data.lineup)) as Prisma.InputJsonValue } });
  return needTeam(database, id);
}
export async function setTeamSeasons(database: Database, id: string, excluded: string[]): Promise<void> {
  for (const season of excluded) await ensureSeason(database, season);
  const seasons = await database.client.season.findMany();
  await database.client.teamSeason.deleteMany({ where: { team_id: id } });
  const included = seasons.filter(season => !excluded.includes(season.id));
  if (included.length > 0) await database.client.teamSeason.createMany({ data: included.map(season => ({ team_id: id, season_id: season.id })) });
}
export async function createInvitation(database: Database, teamId: string, accountId: string): Promise<void> {
  await database.client.teamJoinRequest.create({ data: { team_id: teamId, account_id: accountId, details: { source: 'invitation' } } });
}
export async function respondInvitation(database: Database, teamId: string, accountId: string, accept: boolean): Promise<void> {
  const request = await database.client.teamJoinRequest.findFirst({ where: { team_id: teamId, account_id: accountId }, orderBy: { created_at: 'desc' } });
  if (!request) throw new HttpError(403, 'invitation_required');
  await database.client.teamJoinRequest.update({ where: { id: request.id }, data: { status: accept ? 'accepted' : 'declined', reviewed_at: new Date(), reviewed_by_account_id: accountId } });
}
export async function removeTeam(database: Database, id: string): Promise<void> {
  try { await database.client.team.delete({ where: { id } }); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
      throw new HttpError(409, 'team_has_history', 'This team has league history and cannot be deleted.');
    throw error;
  }
}
export function teamAccounts(database: Database, id: string): Promise<Account[]> {
  // Lock every affected account before deleting its team.
  return database.query<Account>(Prisma.sql`SELECT * FROM asl.accounts WHERE team_id=${id} FOR UPDATE`);
}
export function updateAccountTeam(database: Database, id: string, team_id: string | null): Promise<Account> {
  return database.client.account.update({ where: { id }, data: { team_id } });
}
export async function currentSeason(database: Database): Promise<string> {
  const setting = await database.client.setting.findUnique({ where: { key: 'current_season' } });
  return setting?.value ?? 'S1';
}
export function createTransfer(database: Database, data: Prisma.TransferUncheckedCreateInput) {
  return database.client.transfer.create({ data });
}
