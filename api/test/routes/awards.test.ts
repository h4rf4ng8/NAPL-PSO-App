import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../helper.js';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';

const admin = '33333333-3333-4333-8333-333333333333';
const member = '11111111-1111-4111-8111-111111111111';
const target = '55555555-5555-4555-8555-555555555555';
const verify = async (token: string) => ({ id: token, sessionId: token, claims: { sub: token } });

test('award commands validate, authorize, preserve history, and serialize concurrent assignments', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async () => {
  const database = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const app = createApp({ db: database, verify });
  const call = (method: 'PATCH' | 'PUT' | 'DELETE', url: string, user?: string, payload?: object) => app.inject({
    method, url, headers: user ? { authorization: `Bearer ${user}` } : {}, ...(payload && { payload }),
  });
  const readAwards = async () => {
    const [row] = await database.query(Prisma.sql`SELECT awards FROM asl.accounts WHERE id=${target}::uuid`);
    return row?.awards as Array<Record<string, unknown>>;
  };
  const [original] = await database.query(Prisma.sql`SELECT awards FROM asl.accounts WHERE id=${target}::uuid`);
  const historical = [{ awardId: 'retired-award', season: 'S0', source: 'legacy-import' }];
  try {
    await database.execute(Prisma.sql`UPDATE asl.accounts SET awards=${JSON.stringify(historical)}::jsonb WHERE id=${target}::uuid`);

    assert.equal((await call('PUT', `/api/accounts/${target}/awards/striker/S8`)).statusCode, 401);
    assert.equal((await call('PUT', `/api/accounts/${target}/awards/striker/S8`, member)).statusCode, 403);
    assert.equal((await call('PUT', `/api/accounts/${target}/awards/unknown/S8`, admin)).statusCode, 400);
    assert.equal((await call('PUT', `/api/accounts/${target}/awards/striker/%20%20`, admin)).statusCode, 400);
    assert.equal((await call('PATCH', `/api/accounts/${target}`, admin, { awards: [] })).statusCode, 400);

    await database.execute(Prisma.sql`UPDATE asl.accounts SET awards=${JSON.stringify(Array.from({ length: 1000 }, (_, index) => ({ awardId: `legacy-${index}`, season: 'S0' })))}::jsonb WHERE id=${target}::uuid`);
    assert.equal((await call('PUT', `/api/accounts/${target}/awards/striker/S8`, admin)).statusCode, 400);
    await database.execute(Prisma.sql`UPDATE asl.accounts SET awards=${JSON.stringify(historical)}::jsonb WHERE id=${target}::uuid`);

    assert.equal((await call('PUT', `/api/accounts/${target}/awards/striker/S8`, admin, { assignedBy: 'Forged', assignedAt: 0 })).statusCode, 400);
    const assignedBetween = Date.now();
    const concurrent = await Promise.all([
      call('PUT', `/api/accounts/${target}/awards/striker/S8`, admin),
      call('PUT', `/api/accounts/${target}/awards/striker/S8`, admin),
      call('PUT', `/api/accounts/${target}/awards/striker/S8`, admin),
    ]);
    assert.ok(concurrent.every(response => response.statusCode === 204 || response.statusCode === 409));
    assert.ok(concurrent.some(response => response.statusCode === 204));
    let awards = await readAwards();
    if (concurrent.some(response => response.statusCode === 204))
      assert.ok(awards.some(award => award.awardId === 'striker' && award.season === 'S8'));
    for (const response of concurrent) {
      if (response.statusCode === 409)
        assert.equal((await call('PUT', `/api/accounts/${target}/awards/striker/S8`, admin)).statusCode, 204);
    }
    awards = await readAwards();
    const assigned = awards.filter(award => award.awardId === 'striker' && award.season === 'S8');
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0]?.assignedBy, 'Admin');
    assert.equal(typeof assigned[0]?.assignedAt, 'number');
    assert.ok(Number(assigned[0]?.assignedAt) >= assignedBetween && Number(assigned[0]?.assignedAt) <= Date.now());
    assert.deepEqual(awards.find(award => award.awardId === 'retired-award'), historical[0]);

    const independent = await Promise.all([
      call('PUT', `/api/accounts/${target}/awards/glove/S9`, admin),
      call('PUT', `/api/accounts/${target}/awards/defender/S9`, admin),
    ]);
    assert.ok(independent.every(response => response.statusCode === 204 || response.statusCode === 409));
    for (const [index, awardId] of ['glove', 'defender'].entries()) {
      if (independent[index]?.statusCode === 409)
        assert.equal((await call('PUT', `/api/accounts/${target}/awards/${awardId}/S9`, admin)).statusCode, 204);
    }
    const [withIndependent] = await database.query(Prisma.sql`SELECT awards FROM asl.accounts WHERE id=${target}::uuid`);
    const independentAwards = withIndependent?.awards as Array<Record<string, unknown>>;
    assert.ok(independentAwards.some(award => award.awardId === 'glove' && award.season === 'S9'));
    assert.ok(independentAwards.some(award => award.awardId === 'defender' && award.season === 'S9'));

    const differentKeys = await Promise.all([
      call('DELETE', `/api/accounts/${target}/awards/glove/S9`, admin),
      call('PUT', `/api/accounts/${target}/awards/playmaker/S9`, admin),
    ]);
    assert.ok(differentKeys.every(response => response.statusCode === 204 || response.statusCode === 409));
    let current = await readAwards();
    if (differentKeys[0]?.statusCode === 204)
      assert.ok(current.every(award => !(award.awardId === 'glove' && award.season === 'S9')));
    if (differentKeys[1]?.statusCode === 204)
      assert.ok(current.some(award => award.awardId === 'playmaker' && award.season === 'S9'));
    for (const [index, awardId] of ['glove', 'playmaker'].entries()) {
      if (differentKeys[index]?.statusCode !== 409) {
        continue;
      }

      const method = index === 0 ? 'DELETE' : 'PUT';
      assert.equal((await call(method, `/api/accounts/${target}/awards/${awardId}/S9`, admin)).statusCode, 204);
    }
    current = await readAwards();
    assert.ok(current.every(award => !(award.awardId === 'glove' && award.season === 'S9')));
    assert.ok(current.some(award => award.awardId === 'playmaker' && award.season === 'S9'));

    const removals = await Promise.all([
      call('DELETE', `/api/accounts/${target}/awards/defender/S9`, admin),
      call('DELETE', `/api/accounts/${target}/awards/playmaker/S9`, admin),
    ]);
    assert.ok(removals.every(response => response.statusCode === 204 || response.statusCode === 409));
    current = await readAwards();
    if (removals[0]?.statusCode === 204)
      assert.ok(current.every(award => !(award.awardId === 'defender' && award.season === 'S9')));
    if (removals[1]?.statusCode === 204)
      assert.ok(current.every(award => !(award.awardId === 'playmaker' && award.season === 'S9')));
    for (const [index, awardId] of ['defender', 'playmaker'].entries()) {
      if (removals[index]?.statusCode === 409)
        assert.equal((await call('DELETE', `/api/accounts/${target}/awards/${awardId}/S9`, admin)).statusCode, 204);
    }

    assert.equal((await call('DELETE', `/api/accounts/${target}/awards/striker/S8`, member)).statusCode, 403);
    assert.equal((await call('DELETE', `/api/accounts/${target}/awards/striker/S8`, admin)).statusCode, 204);
    assert.equal((await call('DELETE', `/api/accounts/${target}/awards/striker/S8`, admin)).statusCode, 204);
    assert.equal((await call('DELETE', `/api/accounts/${target}/awards/retired-award/S0`, admin)).statusCode, 204);
    assert.equal((await call('DELETE', `/api/accounts/${target}/awards/retired-award/S0`, admin)).statusCode, 204);
    const [afterDelete] = await database.query(Prisma.sql`SELECT awards FROM asl.accounts WHERE id=${target}::uuid`);
    const finalAwards = afterDelete?.awards as Array<Record<string, unknown>>;
    assert.ok(finalAwards.every(award => !(award.awardId === 'striker' && award.season === 'S8')));
    assert.ok(finalAwards.every(award => award.awardId !== 'retired-award'));
    assert.ok(finalAwards.every(award => award.season !== 'S9'));
  }
  finally {
    await database.execute(Prisma.sql`UPDATE asl.accounts SET awards=${JSON.stringify(original?.awards ?? [])}::jsonb WHERE id=${target}::uuid`);
    await app.close();
    await database.close();
  }
});
