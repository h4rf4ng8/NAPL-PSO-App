import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { ASSET_BUCKET, PRIVATE_BUCKET } from '@napl/contracts/storage';
import { storageFixture, storageRoot, storageSecret, png } from '../storage-fixture.js';
import { storedImage } from '../../routes/payload/page.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
afterEach(() => mock.restoreAll());

test('native signed upload is private, immutable and actor/entity-bound; read capabilities expire in60s', async () => {
  const f = storageFixture(), staged = await f.staged(owner, owner);
  assert.equal(staged.bucket, PRIVATE_BUCKET);
  assert.equal(staged.path.split('/', 2)[1], owner);
  assert.equal(staged.path.split('/', 3)[2], Buffer.from(owner).toString('base64url'));
  assert.ok(!JSON.stringify(staged).includes(storageSecret));
  assert.equal(await f.storage.prepare(staged.sourceUrl, null, { kind: 'account-image', entityId: owner, actorId: owner, public: false }), staged.sourceUrl);
  assert.match(await f.storage.readable(staged.sourceUrl), /\/object\/sign\/.+token=/);
  const image = await f.storage.prepare(staged.sourceUrl, staged.sourceUrl, { kind: 'account-image', entityId: owner, actorId: other, public: true });
  assert.match(image!, new RegExp(`/object/public/${ASSET_BUCKET}/`));
  assert.equal(storedImage(image, '/api/media/accounts/id/image'), image);
  assert.notEqual(storedImage(image, '/api/media/accounts/id/pending-image', false), image);
  assert.equal(f.objects.get(`${ASSET_BUCKET}/${f.storage.reference(image!)!.path}`)?.cache_control, 'max-age=60');
});

test('cross-owner/entity/kind references, noncanonical/signed URLs and new external images are rejected', async () => {
  const f = storageFixture(), staged = await f.staged(owner, owner);
  const target = { kind: 'account-image' as const, entityId: owner, actorId: owner, public: false };
  await assert.rejects(f.storage.prepare(staged.sourceUrl, null, { ...target, actorId: other }), /image_upload_owner_required/);
  await assert.rejects(f.storage.prepare(staged.sourceUrl, null, { ...target, entityId: other }), /invalid_image_reference/);
  await assert.rejects(f.storage.prepare(staged.sourceUrl, null, { ...target, kind: 'team-logo' }), /invalid_image_reference/);
  for (const value of [staged.sourceUrl + '?token=untrusted', staged.sourceUrl.replace(storageRoot, 'https://other.example'), 'https://example.test/new.png']) {
    await assert.rejects(f.storage.prepare(value, null, target), /image_upload_required/);
  }
  const old = 'https://example.test/legacy.png';
  assert.equal(await f.storage.prepare(old, old, target), old);
  const published = await f.storage.prepare(staged.sourceUrl, null, { ...target, public: true });
  await assert.rejects(f.storage.prepare(published, null, target), /image_upload_owner_required/);
});

test('missing, oversized, wrong MIME or cacheable private objects never become saved references', async () => {
  const f = storageFixture(), staged = await f.staged(owner, owner);
  const target = { kind: 'account-image' as const, entityId: owner, actorId: owner, public: false };
  for (const entry of [{ size: 1_500_001, content_type: 'image/png', cache_control: '0' }, { size: 12, content_type: 'text/html', cache_control: '0' }, { size: 12, content_type: 'image/png', cache_control: 'max-age=3600' }]) {
    f.objects.set(`${PRIVATE_BUCKET}/${staged.path}`, entry);
    await assert.rejects(f.storage.prepare(staged.sourceUrl, null, target), /invalid_image_upload|private_image_cache_required/);
  }
  f.objects.delete(`${PRIVATE_BUCKET}/${staged.path}`);
  await assert.rejects(f.storage.prepare(staged.sourceUrl, null, target), /image_upload_missing/);
});

test('copy failure cannot publish a private image and new inline input requires native upload', async () => {
  const f = storageFixture(), staged = await f.staged(owner, owner);
  const target = { kind: 'account-image' as const, entityId: owner, actorId: owner, public: true };
  f.fail.copy = true;
  await assert.rejects(f.storage.prepare(staged.sourceUrl, staged.sourceUrl, target), /storage_unavailable/);
  assert.equal(f.objects.has(`${ASSET_BUCKET}/${staged.path}`), false);
  f.fail.copy = false;
  await assert.rejects(f.storage.prepare(`data:image/png;base64,${png.toString('base64')}`, null, { ...target, public: false }), /image_upload_required/);
});

test('declared image MIME does not permit HTML/truncated containers and reapproval never reuses a public path', async () => {
  const f=storageFixture(), staged=await f.staged(owner,owner);
  const target={kind:'account-image' as const,entityId:owner,actorId:owner,public:true};
  f.objects.set(`${PRIVATE_BUCKET}/${staged.path}`,{size:png.length,content_type:'image/png',cache_control:'0',bytes:Buffer.alloc(png.length,60)});
  await assert.rejects(f.storage.prepare(staged.sourceUrl,staged.sourceUrl,target),/invalid_image_upload/);
  f.objects.set(`${PRIVATE_BUCKET}/${staged.path}`,{size:png.length,content_type:'image/png',cache_control:'0',bytes:png});
  const first=await f.storage.prepare(staged.sourceUrl,staged.sourceUrl,target);
  const second=await f.storage.prepare(staged.sourceUrl,staged.sourceUrl,target);
  assert.notEqual(first,second);
});
