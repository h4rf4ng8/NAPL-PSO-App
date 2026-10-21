import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { uploadImage } from '../src/api/media';
import { login, clearSession, apiPath } from './auth-fixture';

afterEach(clearSession);
const preview = 'data:image/jpeg;base64,aW1hZ2U=';
const sourceUrl = 'https://auth.example.test/storage/v1/object/authenticated/asl-private-media/account-image/a/account/file.jpg';
const credential = { bucket: 'asl-private-media', path: 'account-image/a/account/file.jpg', token: 'signed-upload', sourceUrl };
const nativeFetch = fetch;

test('image bytes go to signed Storage upload and only metadata goes to the API', async () => {
  let uploaded: RequestInit | undefined;
  let issued = false;
  await login(async (url, init) => {
    if (url.startsWith('data:')) return nativeFetch(url);
    if (apiPath(url) === '/api/media/uploads') {
      issued = true;
      assert.deepEqual(JSON.parse(String(init?.body)), { kind: 'account-image', entityId: 'account', contentType: 'image/jpeg' });
      return Response.json(credential);
    }
    assert.ok(issued);
    assert.match(url, /\/storage\/v1\/object\/upload\/sign\/asl-private-media\/account-image\/a\/account\/file.jpg\?token=signed-upload$/);
    uploaded = init;
    return Response.json({ Key: credential.path });
  });
  assert.equal(await uploadImage('account-image', 'account', preview), sourceUrl);
  assert.ok(uploaded?.body instanceof FormData);
  assert.equal(uploaded.body.get('cacheControl'), '0');
  const file = uploaded.body.get('');
  assert.ok(file instanceof Blob);
  assert.equal(await file.text(), 'image');
});

test('a Storage failure never returns a source URL for saving', async () => {
  await login(async url => url.startsWith('data:') ? nativeFetch(url) : (apiPath(url) === '/api/media/uploads' ? Response.json(credential) : Response.json({ message: 'Upload unavailable' }, { status: 503 })));
  await assert.rejects(uploadImage('account-image', 'account', preview), /Upload unavailable/);
});

test('raw external URLs cannot be saved through the upload helper', async () => {
  await assert.rejects(uploadImage('article-cover', 'article', 'https://external.example/image.png'), /Choose an image file/);
});

test('oversized resized images fail before requesting an upload credential', async () => {
  await login(async url => { assert.ok(url.startsWith('data:'));return nativeFetch(url); });
  await assert.rejects(uploadImage('article-cover', 'article', 'data:image/jpeg;base64,' + Buffer.alloc(1_500_001).toString('base64')), /resized image is too large/);
});
