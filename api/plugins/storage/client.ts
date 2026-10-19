import { randomUUID } from 'node:crypto';
import { StorageClient } from '@supabase/storage-js';
import { z } from 'zod';
import { HttpError } from '../auth/identity.js';
import { GatewayError } from '../auth/errors.js';

export const ASSET_BUCKET = 'asl-assets';
export const PRIVATE_BUCKET = 'asl-private-media';
export const imageKind = z.enum(['account-image', 'team-logo', 'article-cover']);
export const imageContentType = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_IMAGE_BYTES = 1_500_000;
export type ImageKind = z.infer<typeof imageKind>;
export type ImageTarget = { kind: ImageKind; entityId: string; actorId: string; public: boolean };
type ObjectRef = { bucket: typeof ASSET_BUCKET | typeof PRIVATE_BUCKET; path: string };
const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
const unavailable = () => new GatewayError(503, 'storage_unavailable', 1);

export class ImageStorage {
  private readonly client: StorageClient;
  private readonly root: string;
  constructor(url: string, secret: string) {
    this.root = url.replace(/\/auth\/v1\/?$/, '').replace(/\/$/, '');
    this.client = new StorageClient(`${this.root}/storage/v1`, { apikey: secret, Authorization: `Bearer ${secret}` },
      (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000), redirect: 'error' }));
  }
  reference(value: string): ObjectRef | null {
    for (const [visibility, bucket] of [['public', ASSET_BUCKET], ['authenticated', PRIVATE_BUCKET]] as const) {
      const prefix = `${this.root}/storage/v1/object/${visibility}/${bucket}/`;
      if (!value.startsWith(prefix)) continue;
      const encoded = value.slice(prefix.length);
      if (!encoded || /[?#]/.test(encoded)) return null;
      try {
        const path = encoded.split('/').map(part => decodeURIComponent(part)).join('/');
        return path.split('/').some(part => !part || part === '.' || part === '..') || this.url({ bucket, path }) !== value ? null : { bucket, path };
      } catch { return null; }
    }
    return null;
  }
  private url(ref: ObjectRef): string {
    return `${this.root}/storage/v1/object/${ref.bucket === ASSET_BUCKET ? 'public' : 'authenticated'}/${ref.bucket}/${ref.path.split('/').map(part => encodeURIComponent(part)).join('/')}`;
  }
  private path(kind: ImageKind, entityId: string, actorId: string, mime: z.infer<typeof imageContentType>): string {
    return `${kind}/${actorId}/${Buffer.from(entityId).toString('base64url')}/${randomUUID()}.${extension[mime]}`;
  }
  async signedUpload(kind: ImageKind, entityId: string, actorId: string, mime: z.infer<typeof imageContentType>) {
    const path = this.path(kind, entityId, actorId, mime);
    const { data, error } = await this.client.from(PRIVATE_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (error) throw unavailable();
    return { bucket: PRIVATE_BUCKET, path, token: data.token, sourceUrl: this.url({ bucket: PRIVATE_BUCKET, path }) };
  }
  private async info(ref: ObjectRef) {
    const { data, error } = await this.client.from(ref.bucket).info(ref.path);
    if (error) {
      if ('statusCode' in error && String(error.statusCode) === '404') throw new HttpError(400, 'image_upload_missing');
      throw unavailable();
    }
    const size = data.size ?? data.metadata?.size;
    const mime = data.contentType ?? data.metadata?.mimetype;
    if (typeof size !== 'number' || size <= 0 || size > MAX_IMAGE_BYTES || !imageContentType.safeParse(mime).success) throw new HttpError(400, 'invalid_image_upload');
    return data;
  }
  async prepare(value: string | null | undefined, previous: string | null, target: ImageTarget): Promise<string | null | undefined> {
    if (value === undefined || value === null) return value;
    const ref = this.reference(value);
    if (value === previous && !ref) return value; // Legacy external references stay readable until migrated.
    if (!ref) throw new HttpError(400, 'image_upload_required');
    const [kind, uploader, entity, file, extra] = ref.path.split('/', 5);
    if (!file || extra !== undefined || kind !== target.kind || entity !== Buffer.from(target.entityId).toString('base64url')) throw new HttpError(400, 'invalid_image_reference');
    if (value !== previous && (ref.bucket !== PRIVATE_BUCKET || uploader !== target.actorId || !/^[\da-f-]{36}\.(?:png|jpg|webp)$/.test(file))) throw new HttpError(403, 'image_upload_owner_required');
    const destination = target.public ? ASSET_BUCKET : PRIVATE_BUCKET;
    if (value === previous && ref.bucket === destination) return value;
    const info = await this.info(ref);
    if (ref.bucket === PRIVATE_BUCKET && /(?:max-age=)?[1-9]\d*/.test(info.cacheControl ?? '0')) throw new HttpError(400, 'private_image_cache_required');
    const downloaded = await this.client.from(ref.bucket).download(ref.path);
    if (downloaded.error) throw unavailable();
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const mime = info.contentType ?? info.metadata?.mimetype;
    if (bytes.length !== (info.size ?? info.metadata?.size) || !validImage(bytes, mime)) throw new HttpError(400, 'invalid_image_upload');
    let destinationPath = ref.path;
    if (ref.bucket !== destination) {
      destinationPath = this.path(target.kind, target.entityId, target.actorId, imageContentType.parse(mime));
      const { error } = await this.client.from(ref.bucket).copy(ref.path, destinationPath, {
        destinationBucket: destination, copyMetadata: false, metadata: { cacheControl: target.public ? 'max-age=60' : 'max-age=0' },
      });
      if (error) throw unavailable();
    }
    return this.url({ bucket: destination, path: destinationPath });
  }
  async readable(value: string): Promise<string> {
    const ref = this.reference(value);
    if (!ref || ref.bucket === ASSET_BUCKET) return value;
    const { data, error } = await this.client.from(ref.bucket).createSignedUrl(ref.path, 60);
    if (error) throw unavailable();
    return data.signedUrl;
  }
  async remove(value: string): Promise<void> {
    const ref = this.reference(value);
    if (!ref) return;
    const { error } = await this.client.from(ref.bucket).remove([ref.path]);
    if (error) throw unavailable();
  }
}

// Reject mislabeled active content and truncated containers before publishing. Browsers decode pixels.
function validImage(bytes: Buffer, mime: unknown): boolean {
  if (mime === 'image/png') {
    if (bytes.length < 45 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
    let offset = 8, data = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      if (offset + length + 12 > bytes.length || (offset === 8 && (type !== 'IHDR' || length !== 13))) return false;
      if (type === 'IDAT') data = true;
      offset += length + 12;
      if (type === 'IEND') return data && length === 0 && offset === bytes.length;
    }
    return false;
  }
  return mime === 'image/jpeg' ? bytes.length >= 4 && bytes.readUInt16BE(0) === 0xFF_D8 && bytes.readUInt16BE(bytes.length - 2) === 0xFF_D9 : mime === 'image/webp' && bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.readUInt32LE(4) + 8 === bytes.length && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
}
