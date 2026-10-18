import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscordClient } from '../../plugins/discord/client.js';
import { config } from './fixtures.js';

test('Discord profile uses the verified user ID and full handle, independent of display name', async context => {
  const username = 'a'.repeat(32);
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://discord.com/api/v10/users/@me');
    assert.deepEqual(init.headers, { Authorization: 'Bearer provider-token' });
    return Response.json({ id: '123456789', username, global_name: 'Someone Else' });
  });
  assert.deepEqual(await new DiscordClient(config).identity('provider-token'), { id: '123456789', username });
});

test('Discord profile rejects missing handles instead of using a display name', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ id: '123456789', global_name: 'Someone Else' }));
  await assert.rejects(new DiscordClient(config).identity('provider-token'));
});
