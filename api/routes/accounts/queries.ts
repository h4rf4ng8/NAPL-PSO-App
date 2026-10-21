import { POS } from '@napl/contracts';
import type { Identity } from '../../plugins/auth/identity.js';
import type { Account, PositionChangeRequest, Team } from '../../generated/prisma/client.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { Prisma, type Database, type Row } from '../../plugins/db/client.js';
import { isCanonicalUuid } from '../../plugins/db/records.js';
import { loadAccountSummaries } from './summaries.js';
import { enrichAccounts } from './ranking.js';
import { rankedAccountsDto } from './dto.js';
import { getSetting } from '../settings/queries.js';

export async function loadRankedAccounts(database: Database, weights?: unknown): Promise<Row[]> {
  const [accounts, activeWeights] = await Promise.all([
    loadAccountSummaries(database),
    weights === undefined ? getSetting(database, 'position_weights') : Promise.resolve(weights),
  ]);
  return enrichAccounts(accounts, activeWeights);
}

export async function listAccounts(database: Database, includePending: boolean, accounts?: Row[]) {
  const rows = accounts ?? await loadRankedAccounts(database);
  const pending = includePending ? await database.client.account.findMany({
    select: { id: true, pending_image_url: true }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  }) : undefined;
  return rankedAccountsDto(rows, pending);
}

export async function getCurrentAccount(database: Database, id: string, accounts?: Row[]) {
  const population = accounts ?? await loadRankedAccounts(database);
  const summary = population.find(row => row.id === id);
  if (!summary) return null;
  const privateFields = await database.client.account.findUnique({
    where: { id }, select: { email: true, pending_image_url: true },
  });
  return { summary, privateFields };
}

export function findAccountByUsername(database: Database, name: string) {
  return database.client.account.findUnique({ where: { username_lower: name.toLowerCase() } });
}

export async function findAccount(database: Database, id: string): Promise<Account | null> {
  return isCanonicalUuid(id) ? database.client.account.findUnique({ where: { id } }) : null;
}

export async function requireAccount(database: Database, id: string, lock = false): Promise<Account> {
  // Prisma has no row-lock API; authorization and mutation must share this lock.
  const rows = lock ? await database.query<Account>(Prisma.sql`SELECT * FROM asl.accounts WHERE id::text=${id} FOR UPDATE`) : [];
  const row = lock ? rows[0] : await findAccount(database, id);
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export async function updateAccount(database: Database, id: string, data: Prisma.AccountUpdateManyMutationInput): Promise<Account> {
  if (!isCanonicalUuid(id)) throw new HttpError(404, 'not_found');
  if (Object.values(data).every(value => value === undefined)) return requireAccount(database, id);
  const [row] = await database.client.account.updateManyAndReturn({ where: { id }, data });
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export function listPositionRequests(database: Database, filter: { accountId?: string; status?: string }) {
  // COALESCE preserves the former JS sort, where Number(null) equals epoch zero.
  return database.query<PositionChangeRequest>(Prisma.sql`SELECT * FROM asl.position_change_requests
    WHERE (${filter.accountId ?? null}::text IS NULL OR account_id::text=${filter.accountId ?? null})
      AND (${filter.status || null}::text IS NULL OR status=${filter.status || null})
    ORDER BY COALESCE(created_at, to_timestamp(0)) DESC, id`);
}

export function hasPendingPositionRequest(database: Database, accountId: string) {
  return database.client.positionChangeRequest.findFirst({ where: { account_id: accountId, status: 'pending' }, select: { id: true } });
}

export function createPositionRequest(database: Database, data: Prisma.PositionChangeRequestUncheckedCreateInput) {
  return database.client.positionChangeRequest.create({ data });
}

export async function lockPositionRequest(database: Database, id: string): Promise<PositionChangeRequest> {
  // Serialize review against competing approvals before changing the account.
  const [row] = await database.query<PositionChangeRequest>(Prisma.sql`SELECT * FROM asl.position_change_requests WHERE id::text=${id} FOR UPDATE`);
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export async function reviewPositionRequest(database: Database, id: string, data: Prisma.PositionChangeRequestUpdateManyMutationInput) {
  const [row] = await database.client.positionChangeRequest.updateManyAndReturn({ where: { id }, data });
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export async function deletePositionRequest(database: Database, id: string): Promise<void> {
  if (isCanonicalUuid(id)) await database.client.positionChangeRequest.deleteMany({ where: { id } });
}

// Discord is the only source of current usernames; JSON snapshots used for display retain history.
export async function syncVerifiedDiscordUsername(database: Database, id: string, name: string): Promise<Account> {
  if (!/^[a-z0-9_.]{2,32}$/.test(name)) throw new HttpError(400, 'invalid_discord_username');
  const current = await requireAccount(database, id, true);
  if (current.username === name) return current;
  const existing = await findAccountByUsername(database, name);
  if (existing && existing.id !== id) throw new HttpError(409, 'discord_username_conflict');
  const replace = (value: Prisma.JsonValue): Prisma.JsonValue => typeof value === 'string' && value.toLowerCase() === current.username.toLowerCase() ? name : value;
  const teams = await database.query<Team>(Prisma.sql`SELECT * FROM asl.teams FOR UPDATE`);
  for (const team of teams) {
    const lineup = team.lineup && typeof team.lineup === 'object' && !Array.isArray(team.lineup) ? team.lineup : {};
    if (Object.values(lineup).some(value => typeof value === 'string' && value.toLowerCase() === current.username.toLowerCase()))
      await database.client.team.update({ where: { id: team.id }, data: { lineup: Object.fromEntries(Object.entries(lineup).map(([slot, value]) => [slot, value === undefined ? undefined : replace(value)])) } });
  }
  // Pending match submissions still resolve player stats by username at approval time.
  const submissions = await database.client.submission.findMany({ where: { status: 'pending' } });
  for (const submission of submissions) {
    const stats = Array.isArray(submission.player_stats) ? submission.player_stats : [];
    const renamed = stats.map(value => value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value, username: value.username === undefined ? undefined : replace(value.username) } : value);
    if (JSON.stringify(renamed) !== JSON.stringify(stats))
      await database.client.submission.update({ where: { id: submission.id }, data: { player_stats: renamed } });
  }
  return updateAccount(database, id, { username: name });
}

export async function provisionAccount(database: Database, identity: Identity, discordUsername?: string) {
  return database.transaction(async tx => {
    await tx.execute(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity.id},0))`);
    const existing = await findAccount(tx, identity.id);
    if (!discordUsername) {
      if (existing) return existing;
      throw new HttpError(409, 'discord_profile_required');
    }
    if (!/^[a-z0-9_.]{2,32}$/.test(discordUsername)) throw new HttpError(400, 'invalid_discord_username');
    await tx.execute(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'username:' + discordUsername},0))`);
    if (existing) return syncVerifiedDiscordUsername(tx, identity.id, discordUsername);
    if (await findAccountByUsername(tx, discordUsername)) throw new HttpError(409, 'discord_username_conflict');
    return tx.client.account.create({ data: {
      id: identity.id, username: discordUsername, position: POS.CM,
      email: typeof identity.claims.email === 'string' ? identity.claims.email : null,
      stats: {}, matches: [], awards: [], championships: [],
    } });
  });
}
