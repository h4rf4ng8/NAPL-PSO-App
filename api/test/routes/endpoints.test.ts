import test from 'node:test';
import { createApp } from '../helper.js';
import { payloadFixture } from '../payload-fixture.js';
import { assertInventory, contractClient } from '../endpoints.js';
test('endpoint inventory and CORS preflight cover actual registrations', async t => {
  const { db } = payloadFixture(), app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: {} }) });
  t.after(() => app.close());
  const client = contractClient(app); await app.ready(); assertInventory(client.registered);
  await client.exchange('OPTIONS', '/{corsPath}', '/api/accounts', { headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization,Content-Type,Apollo-Require-Preflight' } }, 204);
});
