import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { id as resourceId } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { ImageStorage, imageKind, imageContentType } from '../../plugins/storage/client.js';
import { RateLimiter, normalizeIp } from '../../plugins/limits/auth.js';
import { clientIp } from '../../plugins/request.js';
import { GatewayError } from '../../plugins/auth/errors.js';
import { removeUnusedImages } from './storage.js';
import { HttpError, actor, isAdmin } from '../../plugins/auth/identity.js';
import { requireAccount } from '../accounts/queries.js';
import { object } from '../../plugins/db/records.js';
import { pageInput, textPage } from './page.js';

async function sendImage(reply: FastifyReply, value: unknown, descriptor = false, storage?: ImageStorage) {
  if (storage && typeof value === 'string') value = await storage.readable(value);
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return descriptor ? { externalUrl: value } : reply.redirect(new URL(value).href);
  const match = typeof value === 'string' ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value) : null;
  if (!match) throw new HttpError(404, 'not_found');
  return reply.type(match[1]!).send(Buffer.from(match[2]!, 'base64'));
}

export function registerMedia(app: FastifyInstance, { db, storage, auth }: Pick<Dependencies, 'db' | 'storage' | 'auth'>): void {
  const limiter = new RateLimiter(auth.authStore);
  app.post('/api/media/uploads', async request => {
    if (!storage) throw new GatewayError(503, 'storage_unavailable');
    const input = z.strictObject({ kind: imageKind, entityId: resourceId, contentType: imageContentType }).parse(request.body);
    const user = actor(request);
    if (input.kind === 'account-image') {
      const id = z.uuid().parse(input.entityId);
      if (id !== user.id && !isAdmin(request)) throw new HttpError(403, 'forbidden');
      if (!await db.client.account.findUnique({ where: { id }, select: { id: true } })) throw new HttpError(404, 'not_found');
    } else if (input.kind === 'team-logo') {
      const team = await db.client.team.findUnique({ where: { id: input.entityId }, select: { owner_account_id: true } });
      if (team && team.owner_account_id !== user.id && !isAdmin(request)) throw new HttpError(403, 'captain_required');
      if (!team && !await db.client.account.findUnique({ where: { id: user.id }, select: { id: true } })) throw new HttpError(409, 'profile_required');
    } else if (!isAdmin(request)) throw new HttpError(403, 'admin_required');
    await limiter.admit([
      { key: 'storage:global', count: 120, windowMs: 60_000 },
      { key: `storage:ip:${normalizeIp(clientIp(request))}`, count: 20, windowMs: 600_000 },
      { key: `storage:user:${user.id}`, count: 20, windowMs: 600_000 },
    ]);
    return storage.signedUpload(input.kind, input.entityId, user.id, input.contentType);
  });
  app.get('/api/accounts/:id/links/:field', async request => {
    const { id, field } = z.object({ id: z.uuid(), field: z.enum(['steamUrl', 'imageUrl', 'pendingImageUrl']) }).parse(request.params);
    if (actor(request).id !== id && !isAdmin(request)) throw new HttpError(404, 'not_found');
    const row = await db.client.account.findUnique({ where: { id }, select: { steam_url: true, image_url: true, pending_image_url: true } });
    if (!row) throw new HttpError(404, 'not_found');
    const column = { steamUrl: 'steam_url', imageUrl: 'image_url', pendingImageUrl: 'pending_image_url' } as const;
    const source = row[column[field]] ?? '';
    const storedImage = source.startsWith('data:image/') || Boolean(storage?.reference(source));
    return { ...textPage(storedImage ? '' : source, `account-links:${id}:${field}`, pageInput(request).after), storedImage };
  });
  app.get('/api/teams/:id/media-source', async request => {
    const { id } = z.object({ id: resourceId }).parse(request.params);
    const row = await db.client.team.findUnique({ where: { id }, select: { logo_url: true, owner_account_id: true } });
    if (!row || (row.owner_account_id !== actor(request).id && !isAdmin(request))) throw new HttpError(404, 'not_found');
    const storedImage = Boolean(row.logo_url?.startsWith('data:image/') || (row.logo_url && storage?.reference(row.logo_url)));
    return { ...textPage(storedImage ? '' : row.logo_url ?? '', `team-logo:${id}`, pageInput(request).after), storedImage };
  });
  app.get('/api/articles/:id/media-source', { config: { role: 'admin' } }, async request => {
    const { id } = z.object({ id: resourceId }).parse(request.params);
    const row = await db.client.article.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'not_found');
    const storedImage = Boolean(row.cover_image_url?.startsWith('data:image/') || (row.cover_image_url && storage?.reference(row.cover_image_url)));
    return { ...textPage(storedImage ? '' : row.cover_image_url ?? '', `article-cover:${id}`, pageInput(request).after), storedImage };
  });
  app.get('/api/media/accounts/:id/image', { config: { public: true } }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const row = await db.client.account.findUnique({ where: { id }, select: { image_url: true } });
    return sendImage(reply, row?.image_url, object(request.query).descriptor === '1', storage);
  });
  app.get('/api/media/accounts/:id/pending-image', async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    if (actor(request).id !== id && !isAdmin(request)) throw new HttpError(404, 'not_found');
    const row = await db.client.account.findUnique({ where: { id }, select: { pending_image_url: true } });
    return sendImage(reply, row?.pending_image_url, true, storage);
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
    const images: (string | null | undefined)[] = [];
    try {
      await db.transaction(async tx => {
        const row = await requireAccount(tx, id, true);
        if (approve && !row.pending_image_url) throw new HttpError(409, 'pending_image_missing');
        images.push(row.image_url, row.pending_image_url);
        const image = approve && storage ? await storage.prepare(row.pending_image_url, row.pending_image_url, { kind: 'account-image', entityId: id, actorId: actor(request).id, public: true }) : row.pending_image_url;
        if (approve) images.push(image);
        await tx.client.account.update({ where: { id }, data: { ...(approve && { image_url: image }), pending_image_url: null } });
      });
    } finally { await removeUnusedImages(db, storage, request, images); }
    return { ok: true, id };
  });
  app.get('/api/media/teams/:id/logo', { config: { public: true } }, async (request, reply) => {
    const { id } = z.object({ id: resourceId }).parse(request.params);
    const row = await db.client.team.findUnique({ where: { id }, select: { logo_url: true, status: true, owner_account_id: true } });
    if (!row) throw new HttpError(404, 'not_found');
    if (row.status !== 'approved' && !isAdmin(request) && row.owner_account_id !== request.identity?.id) {
      const invitation = request.identity && await db.client.teamJoinRequest.findFirst({ where: { team_id: id, account_id: request.identity.id }, select: { id: true } });
      if (!invitation) throw new HttpError(404, 'not_found');
    }
    return sendImage(reply, row.logo_url, object(request.query).descriptor === '1', storage);
  });
  app.get('/api/media/articles/:id/cover', { config: { public: true } }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(160) }).parse(request.params);
    const row = await db.client.article.findUnique({ where: { id } });
    if (!row || (!row.published_at && !isAdmin(request))) throw new HttpError(404, 'not_found');
    return sendImage(reply, object(row).cover_image_url, object(request.query).descriptor === '1', storage);
  });
}
