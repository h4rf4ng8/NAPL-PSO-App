import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../../scripts/cloudfront-viewer.js', import.meta.url), 'utf8');
const handler = runInNewContext(`${source}\nhandler`);

test('edge overwrites spoofed identity headers using viewer IP and original authorization', () => {
  for (const ip of ['203.0.113.7', '2001:db8::7']) {
    const event = { viewer: { ip }, request: { headers: {
      authorization: { value: 'Bearer synthetic-user-token' },
      'x-napl-client-ip': { value: 'attacker-chosen' },
      'x-napl-authorization': { value: 'Bearer attacker-token' },
    } } };
    const request = handler(event);
    assert.equal(request, event.request);
    assert.equal(request.headers['x-napl-client-ip'].value, ip);
    assert.equal(request.headers['x-napl-authorization'].value, 'Bearer synthetic-user-token');
    assert.equal(request.headers.authorization.value, 'Bearer synthetic-user-token');
  }
});

test('anonymous viewer cannot inject a copied authentication header', () => {
  const request = handler({ viewer: { ip: '203.0.113.7' }, request: { headers: {
    'x-napl-authorization': { value: 'Bearer attacker-token' },
    'x-napl-client-ip': { value: 'attacker-chosen' },
  } } });
  assert.equal(request.headers['x-napl-authorization'], undefined);
  assert.equal(request.headers['x-napl-client-ip'].value, '203.0.113.7');
});
