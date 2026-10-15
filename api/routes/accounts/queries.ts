import type { FastifyRequest } from 'fastify';
import { HttpError, isAdmin } from '../../plugins/auth/identity.js';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { loadAccountSummaries } from './summaries.js';

export async function listAccounts(database: Database, request: FastifyRequest) {
  const rows = await loadAccountSummaries(database);
  if (!isAdmin(request)) return rows;
  const pending = await database.query(Prisma.sql`SELECT id::text AS id, pending_image_url FROM public.accounts ORDER BY created_at, id`);
  const byId = new Map(pending.map(row => [row.id, row.pending_image_url ?? null]));
  return rows.map(row => ({ ...row, pendingImageUrl: byId.get(row.id) ?? null }));
}

export async function getCurrentAccount(database: Database, request: FastifyRequest) {
  const identity = request.identity;
  if (!identity) throw new HttpError(401, 'authentication_required');
  const [summary] = await loadAccountSummaries(database, identity.id);
  if (!summary) return null;
  const [privateFields] = await database.query<Row>(Prisma.sql`SELECT email, pending_image_url FROM public.accounts WHERE id=${identity.id}::uuid`);
  return {
    ...summary,
    email: privateFields?.email ?? null,
    pendingImageUrl: privateFields?.pending_image_url ?? null,
    roles: request.userRoles,
  };
}
