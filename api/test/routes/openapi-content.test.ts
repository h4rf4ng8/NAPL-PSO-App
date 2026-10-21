import assert from 'node:assert/strict';
import test from 'node:test';
import { connectDatabase } from '../../plugins/db/client.js';
import { createApp } from '../helper.js';
import { applicationOperations, contractClient } from '../openapi.js';

test('all content write operations satisfy OpenAPI and retain saved effects', { skip: !process.env.API_TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.API_TEST_DATABASE_URL!);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/napl_test', 'disposable loopback DB only');
  const db = connectDatabase(url.href), admin = '33333333-3333-4333-8333-333333333333';
  const app = createApp({ db, verify: async id => ({ id, sessionId: id, claims: {} }) });
  const client = contractClient(app), headers = { authorization: `Bearer ${admin}` }, prefix = 'openapi_content_';
  const previousSeason = await db.client.setting.findUnique({ where: { key: 'current_season' } });
  const previousRules = await db.client.ruleSection.findMany({ select: { id: true, sort_order: true, updated_at: true } });
  t.after(async () => {
    for (const model of [db.client.news, db.client.ruleSection, db.client.article]) await model.deleteMany({ where: { id: { startsWith: prefix } } });
    for (const rule of previousRules) await db.client.ruleSection.update({ where: { id: rule.id }, data: { sort_order: rule.sort_order, updated_at: rule.updated_at } });
    if (previousSeason) await db.client.setting.update({ where: { key: 'current_season' }, data: { value: previousSeason.value } });
    await app.close(); await db.close();
  });
  const call = (method: string, route: string, path: string, payload?: object) => client.exchange(method, route, path, { headers, ...(payload && { payload }) });
  for (const resource of ['news', 'rules', 'articles']) {
    const id = `${prefix}${resource}`, resourcePath = '/api/' + resource, itemRoute = resourcePath + '/{id}';
    const input = resource === 'news' ? { id, type: 'announcement', body: 'Saved news' } : (resource === 'rules' ? { id, title: 'Saved rule', body: 'Saved rule body' } : { id, slug: 'openapi-content-article', title: 'Saved article', body: 'Saved article body' });
    await call('POST', `/api/${resource}`, `/api/${resource}`, input);
    await call('PATCH', itemRoute, `/api/${resource}/${id}`, { body: 'Changed body' });
    const record = resource === 'news' ? await db.client.news.findUnique({ where: { id } }) : (resource === 'rules' ? await db.client.ruleSection.findUnique({ where: { id } }) : await db.client.article.findUnique({ where: { id } }));
    assert.equal(record?.body, 'Changed body', 'ACK must correspond to saved data');
    if (resource === 'rules') {
      await call('PUT', '/api/rules/order', '/api/rules/order', { ids: [id] });
      await call('POST', '/api/rules/{id}/move', `/api/rules/${id}/move`, { direction: 'up' });
    }
    await call('DELETE', itemRoute, `/api/${resource}/${id}`);
  }
  await call('PUT', '/api/settings/{key}', '/api/settings/current_season', { value: 'S1' });
  assert.equal((await db.client.setting.findUnique({ where: { key: 'current_season' } }))?.value, 'S1');
  const expected = applicationOperations().filter(key => !key.startsWith('GET ') && / \/api\/(news|rules|articles|settings)(?:\/|$)/.test(key));
  assert.deepEqual([...client.covered].toSorted((a, b) => a.localeCompare(b)), expected);
  assert.equal(expected.length, 12);
});
