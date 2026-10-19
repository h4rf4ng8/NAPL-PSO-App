import type { FastifyRequest } from 'fastify';
import type { Database } from '../../plugins/db/client.js';
import { ImageStorage, type ImageTarget } from '../../plugins/storage/client.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { diagnose } from '../../plugins/logging.js';

export async function prepareImage(storage: ImageStorage | undefined, value: string | null | undefined, previous: string | null, target: ImageTarget) {
  if (storage) return storage.prepare(value, previous, target);
  if (value && value !== previous && !value.startsWith('data:image/')) throw new HttpError(400, 'image_upload_required');
  return value;
}
// Run after commit/rollback. A failed write keeps the old reference; a successful one keeps the new.
// Shared objects are removed only after every account/team/article reference has gone.
export async function removeUnusedImages(db: Database, storage: ImageStorage | undefined, request: FastifyRequest, values: (string | null | undefined)[]) {
  if (!storage) return;
  const unique = new Set(values);
  for (const value of unique) {
    if (!value || !storage.reference(value)) continue;
    try {
      const references = await Promise.all([
        db.client.account.count({ where: { OR: [{ image_url: value }, { pending_image_url: value }] } }),
        db.client.team.count({ where: { logo_url: value } }), db.client.article.count({ where: { cover_image_url: value } }),
      ]);
      if (references.every(count => count === 0)) await storage.remove(value);
    } catch (error) { diagnose(request, error, 'storage_cleanup_failed', 'warn'); }
  }
}
