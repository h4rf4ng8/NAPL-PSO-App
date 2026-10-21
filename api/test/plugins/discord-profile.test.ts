import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscordClient } from '../../plugins/discord/client.js';

test('Discord profile uses the verified user ID and full handle, independent of display name', async context => {
  const username = 'a'.repeat(32);
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://discord.com/api/v10/users/@me');
    assert.deepEqual(init.headers, { Authorization: 'Bearer provider-token' });
    return Response.json({ id: '123456789', username, global_name: 'Someone Else' });
  });
  assert.deepEqual(await new DiscordClient().identity('provider-token'), { id: '123456789', username });
});

test('Discord profile rejects missing handles instead of using a display name', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ id: '123456789', global_name: 'Someone Else' }));
  await assert.rejects(new DiscordClient().identity('provider-token'));
});

test('Discord calls are bounded and map upstream and malformed responses safely', async context => {
  for (const [status, code] of [[401, 'discord_consent_required'], [429, 'discord_rate_limited'], [500, 'discord_unavailable']] as const) {
    context.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      assert.ok(init.signal instanceof AbortSignal); assert.equal(init.redirect, 'error');
      return Response.json({ private: 'upstream detail' }, { status });
    });
    await assert.rejects(new DiscordClient().identity('provider-token'), new RegExp(code));
  }
  context.mock.method(globalThis, 'fetch', async () => Response.json({ id: '123', username: 'Invalid Handle' }));
  await assert.rejects(new DiscordClient().identity('provider-token'), /discord_unavailable/);
  context.mock.method(globalThis, 'fetch', async () => { throw new DOMException('timeout', 'TimeoutError'); });
  await assert.rejects(new DiscordClient().identity('provider-token'), /discord_unavailable/);
});
