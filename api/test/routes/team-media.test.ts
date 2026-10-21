import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Database, Row } from '../../plugins/db/client.js';
import { connectDatabase } from '../../plugins/db/client.js';
import { createApp } from '../helper.js';

const owner = '11111111-1111-4111-8111-111111111111';
const invitee = '22222222-2222-4222-8222-222222222222';
const admin = '33333333-3333-4333-8333-333333333333';
const outsider = '55555555-5555-4555-8555-555555555555';
const image = `data:image/png;base64,${Buffer.from('fixture-logo').toString('base64')}`;
const external = 'https://example.test/球?image=⚽';
const headers = (user?: string) => user ? { authorization: `Bearer ${user}` } : {};
const verify = async (id: string) => ({ id, sessionId: id, claims: { sub: id } });

test('team media reads only its selected image and authorization fields', async () => {
  const calls: string[] = [];
  let row: { logo_url: string | null; status: string; owner_account_id: string } | null = { logo_url: image, status: 'approved', owner_account_id: owner };
  const db = {
    client: {
      team: { findUnique: async ({ select }: { select: object }) => {
        calls.push('team');
        assert.deepEqual(Object.keys(select).toSorted((a, b) => a.localeCompare(b)), ['logo_url', 'owner_account_id', 'status']);
        return row;
      } },
      teamJoinRequest: { findFirst: async ({ where, select }: { where: object; select: object }) => {
        calls.push('invitation');
        assert.deepEqual(where, { team_id: 'legacy/team', account_id: invitee });
        assert.deepEqual(select, { id: true });
        return { id: 'invitation' };
      } },
    },
    query: async () => [] as Row[], close: async () => {},
  } as unknown as Database;
  const app = createApp({ db, verify });
  const url = '/api/media/teams/legacy%2Fteam/logo';
  try {
    const publicImage = await app.inject(url);
    assert.equal(publicImage.statusCode, 200, publicImage.body);
    assert.deepEqual(publicImage.rawPayload, Buffer.from('fixture-logo'));
    assert.deepEqual(calls, ['team']);
    calls.length = 0;
    row.status = 'pending';
    assert.equal((await app.inject(url)).statusCode, 404);
    assert.deepEqual(calls, ['team']);
    calls.length = 0;
    assert.equal((await app.inject({ url, headers: headers(invitee) })).statusCode, 200);
    assert.deepEqual(calls, ['team', 'invitation']);
    calls.length = 0;
    row = null;
    assert.equal((await app.inject(url)).statusCode, 404);
    assert.deepEqual(calls, ['team']);
  } finally { await app.close(); }
});

test('database team media preserves approved/hidden owner/admin/invitee access and image representations', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.API_TEST_DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Mutating fixture must use disposable local database');
  const db = connectDatabase(url.href);
  const app = createApp({ db, verify });
  const id = `media_${randomUUID()}`, route = `/api/media/teams/${id}/logo`, source = `/api/teams/${id}/media-source`;
  try {
    await db.client.team.create({ data: { id, name: 'Media access fixture', tag: 'MED', owner_account_id: owner, status: 'pending', logo_url: image } });
    await db.client.teamJoinRequest.create({ data: { team_id: id, account_id: invitee } });
    for (const status of ['approved', 'pending', 'rejected']) for (const logo of [image, external, null]) {
      await db.client.team.update({ where: { id }, data: { status, logo_url: logo } });
      for (const user of [undefined, owner, admin, invitee, outsider]) {
        const allowed = status === 'approved' || user === owner || user === admin || user === invitee;
        for (const descriptor of [false, true]) {
          const response = await app.inject({ url: route + (descriptor ? '?descriptor=1' : ''), headers: headers(user) });
          let expected = 200;
          if (!allowed || logo === null) expected = 404;
          else if (logo === external && !descriptor) expected = 302;
          const role = new Map([[owner, 'owner'], [admin, 'admin'], [invitee, 'invitee']]).get(user ?? '') ?? 'other/anonymous';
          assert.equal(response.statusCode, expected, `${status}/${role}/descriptor=${descriptor}: ${response.body}`);
          if (expected === 200 && logo === image) {
            assert.match(response.headers['content-type']!, /^image\/png/);
            assert.deepEqual(response.rawPayload, Buffer.from('fixture-logo'));
          } else if (expected === 200) assert.deepEqual(response.json(), { externalUrl: external });
          else if (expected === 302) assert.equal(response.headers.location, new URL(external).href);
        }
        const editable = user === owner || user === admin;
        const original = await app.inject({ url: source, headers: headers(user) });
        const expectedSource = user ? (editable ? 200 : 404) : 401;
        assert.equal(original.statusCode, expectedSource, original.body);
        if (!editable) continue;
        assert.equal(original.json().storedImage, logo === image);
        assert.equal(original.json().nodes.join(''), logo === external ? external : '');
      }
    }
    await db.client.team.update({ where: { id }, data: { status: 'pending', logo_url: image } });
    for (const status of ['accepted', 'declined']) {
      await db.client.teamJoinRequest.updateMany({ where: { team_id: id, account_id: invitee }, data: { status } });
      assert.equal((await app.inject({ url: route, headers: headers(invitee) })).statusCode, 200, 'Historical invitation response retains visibility');
    }
    assert.equal((await app.inject({ url: '/api/media/teams/no_such_team/logo', headers: headers(owner) })).statusCode, 404);
  } finally {
    try {
      await db.client.teamJoinRequest.deleteMany({ where: { team_id: id } });
      await db.client.team.deleteMany({ where: { id } });
    } finally { await app.close(); await db.close(); }
  }
});

test('moderation text is owner/admin-only across descriptors, HEAD, continuation and legacy projections', async t => {
  const { payloadFixture, fixtureUser } = await import('../payload-fixture.js');
  const { listTeams } = await import('../../routes/teams/queries.js');
  const f = payloadFixture(), row = f.teams[0]!;
  row.owner_account_id = fixtureUser;
  row.status = 'approved';
  row.rejection_reason = 'Private moderation note. '.repeat(1000);
  Object.assign(f.db.client.team, { findUnique: async () => row });
  Object.assign(f.db.client.teamJoinRequest, { findMany: async () => [{ team_id: row.id, account_id: invitee, status: 'declined', reviewed_at: null }] });
  const original = f.db.query;
  const roles = new Map([[admin, 'admin'], [outsider, 'super_admin']]);
  f.db.query = (async sql => {
    if (!sql.sql.includes('FROM auth_gateway.user_roles')) return original(sql);
    const role = roles.get(String(sql.values[0]));
    return role ? [{role}] : [];
  }) as Database['query'];
  const app = createApp({ db: f.db, verify }); t.after(() => app.close());
  const route = `/api/teams/${row.id}`, text = route + '/text/rejectionReason';
  const first = await app.inject({url:text,headers:headers(fixtureUser)});
  assert.equal(first.statusCode,200,first.body);
  const cursor = first.json().pageInfo.endCursor;
  assert.ok(first.json().pageInfo.hasNextPage);
  for (const user of [undefined,invitee,'66666666-6666-4666-8666-666666666666']) {
    const detail=await app.inject({url:route,headers:headers(user)});
    assert.equal(detail.statusCode,200,detail.body);
    assert.equal(detail.json().rejectionReasonUrl,undefined);
    for(const method of ['GET','HEAD'] as const) for(const url of [text,text+'?after='+encodeURIComponent(cursor)]) assert.equal((await app.inject({method,url,headers:headers(user)})).statusCode,404);
    const legacy=await listTeams(f.db,{id:user,admin:false});
    assert.equal(legacy.find(team=>team.id===row.id)?.rejectionReason,undefined);
  }
  for(const user of [fixtureUser,admin,outsider]) {
    const detail=await app.inject({url:route,headers:headers(user)});
    assert.equal(detail.json().rejectionReasonUrl,text);
    assert.equal((await app.inject({url:text,headers:headers(user)})).statusCode,200);
    assert.equal((await app.inject({url:detail.json().editorUrl,headers:headers(user)})).statusCode,200,'private editor revision must match detail');
  }
});
