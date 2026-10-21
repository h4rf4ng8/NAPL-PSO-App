import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { fetchImageFile } from '../src/utils/input';

test('URL import omits credentials and referrer and reads image bytes with a deadline', async () => {
  const mocked = mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init?.credentials, 'omit');assert.equal(init?.referrerPolicy, 'no-referrer');assert.equal(init?.mode, 'cors');assert.ok(init?.signal instanceof AbortSignal);
    return new Response('image', { headers: { 'content-type': 'image/jpeg' } });
  });
  try { const file = await fetchImageFile('https://external.example/cover');assert.equal(file.type, 'image/jpeg');assert.equal(await file.text(), 'image'); }
  finally { mocked.mock.restore(); }
});

test('oversized URL responses are cancelled even without Content-Length', async () => {
  let cancelled = false;
  const mocked = mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(21 * 1024 * 1024)); },
    cancel() { cancelled = true; },
  })));
  try { await assert.rejects(fetchImageFile('https://external.example/large'), /under 20 MB/);assert.equal(cancelled, true); }
  finally { mocked.mock.restore(); }
});
