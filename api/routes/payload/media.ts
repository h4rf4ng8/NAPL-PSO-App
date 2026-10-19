import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { id as resourceId } from '@napl/contracts';
import type { Database } from '../../plugins/db/client.js';
import { HttpError, actor, isAdmin } from '../../plugins/auth/identity.js';
import { object } from '../../plugins/db/records.js';
import { needTeam } from '../teams/queries.js';
import { pageInput, textPage } from './page.js';

function sendImage(reply: FastifyReply, value: unknown, descriptor = false) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return descriptor ? { externalUrl: value } : reply.redirect(new URL(value).href);
  const match = typeof value === 'string' ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value) : null;
  if (!match) throw new HttpError(404, 'not_found');
  return reply.type(match[1]!).send(Buffer.from(match[2]!, 'base64'));
}

export function registerMedia(app: FastifyInstance, db: Database): void {
  app.get('/api/accounts/:id/links/:field', async request => {
    const { id, field } = z.object({ id: z.uuid(), field: z.enum(['steamUrl', 'imageUrl', 'pendingImageUrl']) }).parse(request.params);
    if (actor(request).id !== id && !isAdmin(request)) throw new HttpError(404, 'not_found');
    const row = await db.client.account.findUnique({ where: { id }, select: { steam_url: true, image_url: true, pending_image_url: true } });
    if (!row) throw new HttpError(404, 'not_found');
    const column = { steamUrl: 'steam_url', imageUrl: 'image_url', pendingImageUrl: 'pending_image_url' } as const;
    const source = row[column[field]] ?? '';
    const storedImage = source.startsWith('data:image/');
    return { ...textPage(storedImage ? '' : source, `account-links:${id}:${field}`, pageInput(request).after), storedImage };
  });
  app.get('/api/teams/:id/media-source', async request => {
    const { id } = z.object({ id: resourceId }).parse(request.params);
    const row = await needTeam(db, id);
    if (row.owner_account_id !== actor(request).id && !isAdmin(request)) throw new HttpError(404, 'not_found');
    const storedImage = Boolean(row.logo_url?.startsWith('data:image/'));
    return { ...textPage(storedImage ? '' : row.logo_url ?? '', `team-logo:${id}`, pageInput(request).after), storedImage };
  });
  app.get('/api/articles/:id/media-source', { config: { role: 'admin' } }, async request => {
    const { id } = z.object({ id: resourceId }).parse(request.params);
    const row = await db.client.article.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'not_found');
    const storedImage = Boolean(row.cover_image_url?.startsWith('data:image/'));
    return { ...textPage(storedImage ? '' : row.cover_image_url ?? '', `article-cover:${id}`, pageInput(request).after), storedImage };
  });
  app.get('/api/media/accounts/:id/image', { config: { public: true } }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const row = await db.client.account.findUnique({ where: { id }, select: { image_url: true } });
    return sendImage(reply, row?.image_url, object(request.query).descriptor === '1');
  });
  app.get('/api/media/accounts/:id/pending-image', async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    if (actor(request).id !== id && !isAdmin(request)) throw new HttpError(404, 'not_found');
    const row = await db.client.account.findUnique({ where: { id }, select: { pending_image_url: true } });
    return typeof row?.pending_image_url === 'string' && /^https?:\/\//.test(row.pending_image_url) ? { externalUrl: row.pending_image_url } : sendImage(reply, row?.pending_image_url);
  });
  app.get('/api/media/accounts/:id/steam', { config: { public: true } }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const row = await db.client.account.findUnique({ where: { id }, select: { steam_url: true } });
    if (!row?.steam_url || !/^https?:\/\//.test(row.steam_url)) throw new HttpError(404, 'not_found');
    return reply.redirect(new URL(row.steam_url).href);
  });
  app.post('/api/accounts/:id/image/review', { config: { role: 'admin' } }, async request => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { approve } = z.strictObject({ approve: z.boolean() }).parse(request.body);
    await db.transaction(async tx => {
      const row = await tx.client.account.findUnique({ where: { id }, select: { pending_image_url: true } });
      if (!row) throw new HttpError(404, 'not_found');
      if (approve && !row.pending_image_url) throw new HttpError(409, 'pending_image_missing');
      await tx.client.account.update({ where: { id }, data: { ...(approve && { image_url: row.pending_image_url }), pending_image_url: null } });
    });
    return { ok: true, id };
  });
  app.get('/api/media/teams/:id/logo', { config: { public: true } }, async (request, reply) => {
    const { id } = z.object({ id: resourceId }).parse(request.params);
    const row = await needTeam(db, id);
    if (row.status !== 'approved' && !isAdmin(request) && row.owner_account_id !== request.identity?.id && row.pending_members.every(member => member.accountId !== request.identity?.id)) throw new HttpError(404, 'not_found');
    return sendImage(reply, row.logo_url, object(request.query).descriptor === '1');
  });
  app.get('/api/media/articles/:id/cover', { config: { public: true } }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(160) }).parse(request.params);
    const row = await db.client.article.findUnique({ where: { id } });
    if (!row || (!row.published_at && !isAdmin(request))) throw new HttpError(404, 'not_found');
    return sendImage(reply, object(row).cover_image_url, object(request.query).descriptor === '1');
  });
}
