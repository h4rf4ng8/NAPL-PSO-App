import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../../plugins/db/client.js';
import { actor, HttpError, isAdmin } from '../../plugins/auth/identity.js';
import { object } from '../../plugins/db/records.js';
import { getSubmission } from '../matches/queries.js';
import { submissionDto } from '../matches/dto.js';
import { accountOpponents } from '../accounts/history.js';
import { pathSegment, bytes, detailUrl, page, pageInput, requireRevision, textPage } from './page.js';

// Legacy match/submission schemas intentionally retain arbitrary imported extension values.
// These explicit edit/detail resources preserve those values without putting them in list rows.
export function fieldPage(value: unknown, url: string, request: FastifyRequest) {
  const entries = value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [[null, value]];
  return page(entries.map(([key, field], index) => bytes({ key, value: field }) <= 3000
    ? { index, key, value: field }
    : { index, key: typeof key === 'string' && bytes(key) < 500 ? key : null, valueUrl: detailUrl(`${url}/fields/${index}`, value) }), url, pageInput(request));
}
export function fieldValue(value: unknown, index: string, scope: string, request: FastifyRequest) {
  requireRevision(value, request);
  const entries = value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [[null, value]];
  const ordinal = z.coerce.number().int().min(0).parse(index);
  const entry = entries[ordinal];
  if (!entry) throw new HttpError(404, 'not_found');
  return textPage(JSON.stringify({ key: entry[0], value: entry[1] }), `${scope}:${ordinal}`, pageInput(request).after);
}

export function registerDetails(app: FastifyInstance, db: Database): void {
  const accountStats = async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const row = await db.client.account.findUnique({ where: { id }, select: { stats: true } });
    if (!row) throw new HttpError(404, 'not_found');
    return { id, stats: row.stats };
  };
  app.get('/api/accounts/:id/stats', { config: { public: true } }, async request => {
    const { id, stats } = await accountStats(request);
    if (z.object({ revision: z.string().optional() }).parse(request.query).revision) requireRevision(stats, request);
    return fieldPage(stats, `/api/accounts/${id}/stats`, request);
  });
  app.get('/api/accounts/:id/stats/fields/:field', { config: { public: true } }, async request => {
    const { id, stats } = await accountStats(request);
    const { field } = z.object({ field: z.string() }).parse(request.params);
    return fieldValue(stats, field, `account-stats:${id}`, request);
  });
  app.get('/api/accounts/:id/opponents/:ordinal/name', { config: { public: true } }, async request => {
    const { id, ordinal } = z.object({ id: z.uuid(), ordinal: z.coerce.number().int().min(0) }).parse(request.params);
    const opponents = await accountOpponents(db, id);
    const row = opponents[ordinal];
    if (!row) throw new HttpError(404, 'not_found');
    requireRevision(row.opponent, request);
    return textPage(row.opponent, `opponent:${id}:${ordinal}`, pageInput(request).after);
  });
  const accountCollection = async (request: FastifyRequest) => {
    const params = z.object({ id: z.uuid(), collection: z.enum(['matches', 'awards', 'championships']) }).parse(request.params);
    const row = await db.client.account.findUnique({ where: { id: params.id }, select: { matches: true, awards: true, championships: true } });
    if (!row) throw new HttpError(404, 'not_found');
    const value = row[params.collection];
    return { values: Array.isArray(value) ? value : [], url: `/api/accounts/${params.id}/history/${params.collection}` };
  };
  app.get('/api/accounts/:id/history/:collection', { config: { public: true } }, async request => {
    const { values, url } = await accountCollection(request);
    return page(values.map((value, index) => ({ index, detailUrl: detailUrl(`${url}/${index}`, value), fieldCount: Object.keys(object(value)).length })), url, pageInput(request));
  });
  app.get('/api/accounts/:id/history/:collection/:ordinal', { config: { public: true } }, async request => {
    const { values, url } = await accountCollection(request);
    const { ordinal } = z.object({ ordinal: z.coerce.number().int().min(0) }).parse(request.params);
    if (ordinal >= values.length) throw new HttpError(404, 'not_found');
    requireRevision(values[ordinal], request);
    return fieldPage(values[ordinal], `${url}/${ordinal}`, request);
  });
  app.get('/api/accounts/:id/history/:collection/:ordinal/fields/:field', { config: { public: true } }, async request => {
    const { values, url } = await accountCollection(request);
    const { ordinal, field } = z.object({ ordinal: z.coerce.number().int().min(0), field: z.string() }).parse(request.params);
    if (ordinal >= values.length) throw new HttpError(404, 'not_found');
    return fieldValue(values[ordinal], field, `${url}/${ordinal}`, request);
  });
  const submission = async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().min(1).max(160) }).parse(request.params);
    const row = await getSubmission(db, id);
    if (!row || (!isAdmin(request) && row.submitted_by_account_id !== actor(request).id)) throw new HttpError(404, 'not_found');
    // List and detail revisions use the same current display attribution, while stored snapshots remain unchanged.
    const [submitter, reviewer] = await Promise.all([
      row.submitted_by_account_id ? db.client.account.findUnique({ where: { id: row.submitted_by_account_id }, select: { username: true } }) : null,
      row.reviewed_by_account_id ? db.client.account.findUnique({ where: { id: row.reviewed_by_account_id }, select: { username: true } }) : null,
    ]);
    return { ...row, submitted_by: submitter?.username ?? row.submitted_by, reviewed_by: reviewer?.username ?? row.reviewed_by };
  };
  app.get('/api/submissions/:id/detail', async request => {
    const row = await submission(request);
    requireRevision(submissionDto(row), request);
    return fieldPage(submissionDto(row), `/api/submissions/${pathSegment(row.id)}/detail`, request);
  });
  app.get('/api/submissions/:id/detail/fields/:field', async request => {
    const row = await submission(request);
    const { field } = z.object({ field: z.string() }).parse(request.params);
    return fieldValue(submissionDto(row), field, `submission:${row.id}`, request);
  });
}
