import { POS } from '@napl/contracts';
import type { Identity } from '../../plugins/auth/identity.js';
import { object, string } from '../../plugins/db/records.js';
import { checkBlockedName } from '../name-validation.js';
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
  const rows = lock ? await database.query<Account>(Prisma.sql`SELECT * FROM public.accounts WHERE id::text=${id} FOR UPDATE`) : [];
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
  return database.query<PositionChangeRequest>(Prisma.sql`SELECT * FROM public.position_change_requests
    WHERE (${filter.accountId ?? null}::text IS NULL OR account_id::text=${filter.accountId ?? null})
      AND (${filter.status || null}::text IS NULL OR status=${filter.status || null})
    ORDER BY COALESCE(created_at, to_timestamp(0)) DESC`);
}

export function hasPendingPositionRequest(database: Database, accountId: string) {
  return database.client.positionChangeRequest.findFirst({ where: { account_id: accountId, status: 'pending' }, select: { id: true } });
}

export function createPositionRequest(database: Database, data: Prisma.PositionChangeRequestCreateInput) {
  return database.client.positionChangeRequest.create({ data });
}

export async function lockPositionRequest(database: Database, id: string): Promise<PositionChangeRequest> {
  // Serialize review against competing approvals before changing the account.
  const [row] = await database.query<PositionChangeRequest>(Prisma.sql`SELECT * FROM public.position_change_requests WHERE id::text=${id} FOR UPDATE`);
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

export async function renameAccount(database: Database, id: string, name: string): Promise<void> {
  const current = await requireAccount(database, id, true), old = current.username.toLowerCase();
  const replace = (value: Prisma.JsonValue): Prisma.JsonValue => typeof value === 'string' && value.toLowerCase() === old ? name : value;
  const renameEntry = (value: Prisma.JsonValue): Prisma.InputJsonObject => {
    const entry = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
    return { ...entry, username: entry.username === undefined ? undefined : replace(entry.username) };
  };
  await updateAccount(database, id, { username: name, username_lower: name.toLowerCase() });
  // Lock every affected team while renaming references stored inside JSON documents.
  const teams = await database.query<Team>(Prisma.sql`SELECT * FROM public.teams FOR UPDATE`);
  for (const team of teams) {
    await database.client.team.update({ where: { id: team.id }, data: {
      owner_username: team.owner_username.toLowerCase() === old ? name : team.owner_username,
      members: Array.isArray(team.members) ? team.members.map(value => replace(value)) : [],
      pending_members: Array.isArray(team.pending_members) ? team.pending_members.map(value => typeof value === 'string' ? replace(value) : renameEntry(value)) : [],
      lineup: Object.fromEntries(Object.entries(team.lineup && typeof team.lineup === 'object' && !Array.isArray(team.lineup) ? team.lineup : {}).map(([slot, value]) => [slot, value === undefined ? undefined : replace(value)])),
    } });
  }
  // These literal identifiers are the complete allowlist; values stay bound.
  // SQL lower/equality preserves literal '%' and '_' rather than ILIKE patterns.
  for (const [table, column] of [
    [Prisma.sql`public.transfers`, Prisma.sql`player_username`], [Prisma.sql`public.transfers`, Prisma.sql`created_by`],
    [Prisma.sql`public.totw_votes`, Prisma.sql`voter_username`], [Prisma.sql`public.totw_votes`, Prisma.sql`voted_for_username`],
    [Prisma.sql`public.position_change_requests`, Prisma.sql`username`], [Prisma.sql`public.submissions`, Prisma.sql`submitted_by`],
    [Prisma.sql`public.submissions`, Prisma.sql`reviewed_by`], [Prisma.sql`public.articles`, Prisma.sql`author`], [Prisma.sql`public.news`, Prisma.sql`author`],
  ]) {
    await database.execute(Prisma.sql`UPDATE ${table} SET ${column}=${name} WHERE lower(${column})=${old}`);
  }
  const periods = await database.client.totwVotingPeriod.findMany();
  for (const period of periods) {
    await database.client.totwVotingPeriod.update({ where: { id: period.id }, data: {
      eligible_players: Array.isArray(period.eligible_players) ? period.eligible_players.map(value => replace(value)) : [],
      winners: period.winners === null ? Prisma.JsonNull : Object.fromEntries(Object.entries(typeof period.winners === 'object' && !Array.isArray(period.winners) ? period.winners : {}).map(([slot, value]) => [slot, value === undefined ? undefined : replace(value)])),
    } });
  }
  const submissions = await database.client.submission.findMany();
  for (const submission of submissions) {
    await database.client.submission.update({ where: { id: submission.id }, data: {
      player_stats: Array.isArray(submission.player_stats) ? submission.player_stats.map(value => renameEntry(value)) : [],
      edits: Array.isArray(submission.edits) ? submission.edits.map(value => renameEntry(value)) : [],
    } });
  }
}

export async function provisionAccount(database: Database, identity: Identity) {
    return database.transaction(async (tx) => {
        // Advisory locks serialize provisioning and name selection without a row to lock.
        await tx.execute(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity.id},0))`);
        const existing = await findAccount(tx, identity.id);
        if (existing) return existing;
        const metadata = object(identity.claims.user_metadata);
        const candidate = string(metadata.preferred_username || metadata.user_name || metadata.name || metadata.username)
            .replaceAll(/[^\p{L}\p{N}_. -]/gu, '').trim().slice(0, 20);
        const base = candidate.length >= 2 && !checkBlockedName(candidate) ? candidate : 'Player';
        await tx.execute(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'username:' + base.toLowerCase()},0))`);
        let name = base;
        if (await findAccountByUsername(tx, name))
            name = `${base}_${identity.id.replaceAll('-', '')}`;
        if (await findAccountByUsername(tx, name))
            name = `${base}_${crypto.randomUUID().replaceAll('-', '')}`;
        return tx.client.account.create({ data: {
            id: identity.id, username: name, username_lower: name.toLowerCase(), position: POS.CM,
            email: typeof identity.claims.email === 'string' ? identity.claims.email : null,
            stats: {}, matches: [], awards: [], championships: [],
        } });
    });
}
