import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Database } from '../../plugins/db/client.js';
import { createApp } from '../helper.js';
import { payloadFixture, fixtureUser } from '../payload-fixture.js';
import { storageFixture, png } from '../storage-fixture.js';
import { ASSET_BUCKET, PRIVATE_BUCKET } from '../../plugins/storage/client.js';

const admin = '00000000-0000-4000-8000-000000000003';
const outsider = '00000000-0000-4000-8000-000000000002';
afterEach(() => mock.restoreAll());
function harness() {
  const fixture = payloadFixture(), native = storageFixture();
  const original = fixture.db.query;
  fixture.db.query = (async sql => sql.sql.includes('FROM auth_gateway.user_roles') ? (sql.values[0] === admin ? [{role:'admin'}] : []) : original(sql)) as Database['query'];
  const client = fixture.db.client;
  Object.assign(client.account, { count: async ({where}: {where:{OR:Array<{image_url?:string;pending_image_url?:string}>}}) => fixture.accounts.filter(row => where.OR.some(value => (value.image_url !== undefined && value.image_url === row.image_url) || (value.pending_image_url !== undefined && value.pending_image_url === row.pending_image_url))).length });
  Object.assign(client.team, {count:async () => 0});
  Object.assign(client.article, {count:async () => 0});
  const app = createApp({db:fixture.db, storage:native.storage, verify:async id => ({id,sessionId:'test',claims:{}})});
  return {...fixture,...native,app};
}
const headers = (id: string) => ({authorization:`Bearer ${id}`});

test('signed uploads require existing owner/admin and return bounded native capability', async t => {
  const f=harness();t.after(()=>f.app.close());
  const payload={kind:'account-image',entityId:fixtureUser,contentType:'image/png'};
  assert.equal((await f.app.inject({method:'POST',url:'/api/media/uploads',payload})).statusCode,401);
  assert.equal((await f.app.inject({method:'POST',url:'/api/media/uploads',headers:headers(outsider),payload})).statusCode,403);
  const response=await f.app.inject({method:'POST',url:'/api/media/uploads',headers:headers(fixtureUser),payload});
  assert.equal(response.statusCode,200,response.body);assert.equal(response.json().bucket,PRIVATE_BUCKET);assert.ok(response.rawPayload.length<10_000);
});

test('private pending descriptors preserve owner/admin access and no-store, approval publishes a fresh object', async t => {
  const f=harness();t.after(()=>f.app.close());const staged=await f.staged(fixtureUser,fixtureUser);
  f.accounts[0]!.pending_image_url=staged.sourceUrl;
  const url=`/api/media/accounts/${fixtureUser}/pending-image`;
  assert.equal((await f.app.inject({url,headers:headers(outsider)})).statusCode,404);
  for(const id of [fixtureUser,admin]) {const r=await f.app.inject({url,headers:headers(id)});assert.equal(r.statusCode,200,r.body);assert.match(r.json().externalUrl,/token=/);assert.match(r.headers['cache-control']!,/no-store/);}
  const response=await f.app.inject({method:'POST',url:`/api/accounts/${fixtureUser}/image/review`,headers:headers(admin),payload:{approve:true}});
  assert.equal(response.statusCode,200,response.body);assert.equal(f.accounts[0]!.pending_image_url,null);
  const ref=f.storage.reference(f.accounts[0]!.image_url)!;assert.equal(ref.bucket,ASSET_BUCKET);assert.notEqual(ref.path,staged.path);assert.deepEqual(f.objects.get(`${ref.bucket}/${ref.path}`)?.bytes,png);
});

test('copy failure preserves pending data; failed DB write removes the newly public object', async t => {
  const f=harness();t.after(()=>f.app.close());const staged=await f.staged(fixtureUser,fixtureUser);f.accounts[0]!.pending_image_url=staged.sourceUrl;
  const request={method:'POST' as const,url:`/api/accounts/${fixtureUser}/image/review`,headers:headers(admin),payload:{approve:true}};
  f.fail.copy=true;assert.equal((await f.app.inject(request)).statusCode,503);assert.equal(f.accounts[0]!.pending_image_url,staged.sourceUrl);
  f.fail.copy=false;let writes=0;mock.method(f.db.client.account,'update',async()=>{writes++;throw new Error('synthetic DB failure');});
  assert.equal((await f.app.inject(request)).statusCode,503);assert.equal(f.accounts[0]!.pending_image_url,staged.sourceUrl);
  assert.equal(writes,1);assert.equal(f.objects.keys().filter(key=>key.startsWith(ASSET_BUCKET+'/')).toArray().length,0);
});

test('cleanup failure after committed approval preserves successful mutation and new reference', async t => {
  const f=harness();t.after(()=>f.app.close());const staged=await f.staged(fixtureUser,fixtureUser);f.accounts[0]!.pending_image_url=staged.sourceUrl;f.fail.remove=true;
  const response=await f.app.inject({method:'POST',url:`/api/accounts/${fixtureUser}/image/review`,headers:headers(admin),payload:{approve:true}});
  assert.equal(response.statusCode,200,response.body);assert.equal(f.accounts[0]!.pending_image_url,null);assert.equal(f.storage.reference(f.accounts[0]!.image_url)?.bucket,ASSET_BUCKET);
});
