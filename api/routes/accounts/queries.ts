import type { FastifyRequest } from 'fastify';
import { HttpError, isAdmin } from '../../plugins/auth/identity.js';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { loadAccountSummaries } from './summaries.js';
import { enrichAccounts } from './ranking.js';
import { getSetting } from '../settings/queries.js';

export async function loadRankedAccounts(database: Database, weights?: unknown): Promise<Row[]> {
  const [accounts, activeWeights] = await Promise.all([
    loadAccountSummaries(database),
    weights === undefined ? getSetting(database, 'position_weights') : Promise.resolve(weights),
  ]);
  return enrichAccounts(accounts, activeWeights);
}

export async function listAccounts(database: Database, request: FastifyRequest, accounts?: Row[]) {
  const rows = accounts ?? await loadRankedAccounts(database);
  if (!isAdmin(request)) return rows;
  const pending = await database.query(Prisma.sql`SELECT id::text AS id, pending_image_url FROM public.accounts ORDER BY created_at, id`);
  const byId = new Map(pending.map(row => [row.id, row.pending_image_url ?? null]));
  return rows.map(row => ({ ...row, pendingImageUrl: byId.get(row.id) ?? null }));
}

export async function getCurrentAccount(database: Database, request: FastifyRequest, accounts?: Row[]) {
  const identity = request.identity;
  if (!identity) throw new HttpError(401, 'authentication_required');
  const population = accounts ?? await loadRankedAccounts(database);
  const summary = population.find(row => row.id === identity.id);
  if (!summary) return null;
  const [privateFields] = await database.query<Row>(Prisma.sql`SELECT email, pending_image_url FROM public.accounts WHERE id=${identity.id}::uuid`);
  return {
    ...summary,
    email: privateFields?.email ?? null,
    pendingImageUrl: privateFields?.pending_image_url ?? null,
    roles: request.userRoles,
  };
}
