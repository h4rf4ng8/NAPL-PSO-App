import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { ImageStorage, ASSET_BUCKET, PRIVATE_BUCKET } from '../plugins/storage/client.js';

export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
export const storageRoot = 'https://storage.example.test';
export const storageSecret = 'synthetic-server-storage-secret';
export type StoredObject = { size: number; content_type: string; cache_control: string; bytes?: Buffer };
export function storageFixture() {
  const objects = new Map<string, StoredObject>();
  const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const fail = { copy: false, remove: false };
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.origin, storageRoot, 'Tests must never reach hosted Storage');
    assert.equal(new Headers(init?.headers).get('apikey'), storageSecret);
    const path = decodeURIComponent(url.pathname.slice('/storage/v1'.length));
    let body: Record<string, unknown> = {};
    body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : body;
    calls.push({ path, method: init?.method ?? 'GET', body });
    if (path.startsWith('/object/upload/sign/')) return Response.json({ url: `${path}?token=synthetic-upload-capability` });
    if ((init?.method ?? 'GET') === 'GET' && (path.startsWith(`/object/${PRIVATE_BUCKET}/`) || path.startsWith(`/object/${ASSET_BUCKET}/`))) {
      const value = objects.get(path.slice('/object/'.length));
      return value ? new Response(value.bytes ?? png) : new Response('', { status: 404 });
    }
    if (path.startsWith('/object/info/')) {
      const value = objects.get(path.slice('/object/info/'.length));
      return value ? Response.json(value) : Response.json({ message: 'missing', statusCode: '404', error: 'NotFound' }, { status: 404 });
    }
    if (path.startsWith('/object/sign/')) {
      assert.equal(body.expiresIn, 60);
      return Response.json({ signedURL: `${path}?token=synthetic-read-capability` });
    }
    if (path === '/object/copy') {
      if (fail.copy) return Response.json({ message: 'failed', statusCode: '503' }, { status: 503 });
      const previous = objects.get(`${String(body.bucketId)}/${String(body.sourceKey)}`);
      assert.ok(previous);
      assert.equal(body.copyMetadata, false);
      const target = String(body.destinationBucket);
      const metadata = body.metadata as { cacheControl: string };
      assert.equal(metadata.cacheControl, target === ASSET_BUCKET ? 'max-age=60' : 'max-age=0');
      objects.set(`${target}/${String(body.destinationKey)}`, { ...previous, cache_control: metadata.cacheControl });
      return Response.json({ Key: body.destinationKey });
    }
    if (init?.method === 'DELETE') {
      if (fail.remove) return Response.json({ message: 'failed', statusCode: '503' }, { status: 503 });
      for (const prefix of body.prefixes as string[]) objects.delete(`${path.slice('/object/'.length)}/${prefix}`);
      return Response.json([]);
    }
    if (init?.method === 'POST' && path.startsWith(`/object/${PRIVATE_BUCKET}/`)) {
      const headers = new Headers(init.headers);
      objects.set(path.slice('/object/'.length), { bytes: Buffer.from(init.body as Buffer), size: Buffer.byteLength(init.body as Buffer), content_type: headers.get('content-type')!, cache_control: headers.get('cache-control')! });
      return Response.json({ Key: path });
    }
    throw new Error('Unexpected Storage operation in test');
  });
  const storage = new ImageStorage(storageRoot, storageSecret);
  const staged = async (actorId: string, entityId: string, kind: 'account-image' | 'team-logo' | 'article-cover' = 'account-image') => {
    const value = await storage.signedUpload(kind, entityId, actorId, 'image/png');
    objects.set(`${value.bucket}/${value.path}`, { size: png.length, bytes: png, content_type: 'image/png', cache_control: 'max-age=0' });
    return value;
  };
  return { storage, objects, calls, fail, staged };
}
