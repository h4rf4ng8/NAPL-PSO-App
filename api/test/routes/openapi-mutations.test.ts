import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock, test } from 'node:test';
import { connectDatabase, Prisma } from '../../plugins/db/client.js';
import { createApp } from '../helper.js';
import { contractClient, applicationOperations } from '../openapi.js';
import { storageFixture, png } from '../storage-fixture.js';

const content = /^\/api\/(news|rules|articles|settings)(?:\/|$)/;
test('all remaining application mutations complete successful contract exchanges', {
  skip: !process.env.API_TEST_DATABASE_URL || !process.env.API_TEST_ADMIN_DATABASE_URL,
}, async t => {
  for (const value of [process.env.API_TEST_DATABASE_URL!, process.env.API_TEST_ADMIN_DATABASE_URL!]) {
    const url = new URL(value);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    assert.equal(url.pathname, '/napl_test', 'Mutations require the disposable test database');
  }
  const db = connectDatabase(process.env.API_TEST_DATABASE_URL!), owner = connectDatabase(process.env.API_TEST_ADMIN_DATABASE_URL!);
  const prefix = `contract_${randomUUID().slice(0,8)}`, season = prefix + '_season';
  const actors = Array.from({length:5},(_,index)=>({id:randomUUID(),username:`Contract${index}_${prefix.slice(-8)}`,position:['GK','ST','DEF','CM','CM'][index]!}));
  const [captain,striker,defender,midfielder,admin] = actors as [typeof actors[number],typeof actors[number],typeof actors[number],typeof actors[number],typeof actors[number]];
  const ids = actors.map(actor=>actor.id), home = prefix+'_home', away = prefix+'_away', spare = prefix+'_spare', teamIds = [home,away,spare];
  const native = storageFixture(), app = createApp({db,storage:native.storage,verify:async id=>({id,sessionId:id,claims:{sub:id}})});
  const c = contractClient(app);
  const write = (method:string, route:string, url:string, payload?:object, user=admin.id) => c.exchange(method,route,url,{headers:{authorization:`Bearer ${user}`},...(payload!==undefined&&{payload})});
  t.after(async()=>{
    await app.close();mock.restoreAll();
    try {
      await owner.client.news.deleteMany({where:{auto_from_submission:{startsWith:prefix}}});
      await owner.client.submission.deleteMany({where:{id:{startsWith:prefix}}});
      await owner.client.scheduledMatch.deleteMany({where:{id:{startsWith:prefix}}});
      await owner.client.transfer.deleteMany({where:{OR:[{id:{startsWith:prefix}},{player_account_id:{in:ids}}]}});
      await owner.client.totwVotingPeriod.deleteMany({where:{created_by_account_id:admin.id}});
      await owner.client.positionChangeRequest.deleteMany({where:{account_id:{in:ids}}});
      await owner.client.team.deleteMany({where:{id:{in:teamIds}}});
      await owner.client.userRole.deleteMany({where:{user_id:{in:ids}}});
      await owner.execute(Prisma.sql`DELETE FROM auth_gateway.role_audit_events WHERE actor_user_id=${admin.id}::uuid`);
      await owner.client.account.deleteMany({where:{id:{in:ids}}});
      await owner.execute(Prisma.sql`DELETE FROM auth.users WHERE id IN (${Prisma.join(ids.map(id=>Prisma.sql`${id}::uuid`))})`);
      await owner.client.teamSeason.deleteMany({where:{season_id:season}});
      await owner.client.season.deleteMany({where:{id:season}});
    } finally { await db.close();await owner.close(); }
  });
  for(const [index,actor] of actors.entries()) {
    await owner.execute(Prisma.sql`INSERT INTO auth.users(id) VALUES(${actor.id}::uuid)`);
    await owner.client.account.create({data:{...actor,strikers_id:`${Date.now()}${index}`}});
  }
  await owner.client.userRole.create({data:{user_id:admin.id,role:'super_admin'}});
  await write('POST','/api/accounts/me','/api/accounts/me',{},captain.id);
  await write('PATCH','/api/accounts/{id}',`/api/accounts/${captain.id}`,{country:'US'},captain.id);
  const upload = (await write('POST','/api/media/uploads','/api/media/uploads',{kind:'account-image',entityId:captain.id,contentType:'image/png'},captain.id)).json();
  native.objects.set(`${upload.bucket}/${upload.path}`,{size:png.length,bytes:png,content_type:'image/png',cache_control:'max-age=0'});
  await write('PATCH','/api/accounts/{id}',`/api/accounts/${captain.id}`,{pendingImageUrl:upload.sourceUrl},captain.id);
  await write('POST','/api/accounts/{id}/image/review',`/api/accounts/${captain.id}/image/review`,{approve:true});
  assert.equal((await db.client.account.findUniqueOrThrow({where:{id:captain.id}})).pending_image_url,null);
  await c.exchange('PUT','/api/accounts/{id}/awards/{awardId}/{season}',`/api/accounts/${captain.id}/awards/glove/${season}`,{headers:{authorization:`Bearer ${admin.id}`}},204);
  await c.exchange('DELETE','/api/accounts/{id}/awards/{awardId}/{season}',`/api/accounts/${captain.id}/awards/glove/${season}`,{headers:{authorization:`Bearer ${admin.id}`}},204);
  const request = (await write('POST','/api/position-requests','/api/position-requests',{toPos:'CM',reason:'Contract request'},defender.id)).json();
  await write('POST','/api/position-requests/{id}/review',`/api/position-requests/${request.id}/review`,{status:'denied',reviewNote:'Contract review'});
  await write('DELETE','/api/position-requests/{id}',`/api/position-requests/${request.id}`);
  const previousAdmins = await owner.client.userRole.findMany({where:{role:'admin'},select:{user_id:true}});
  await write('PUT','/api/roles','/api/roles',{userIds:[...previousAdmins.map(row=>row.user_id),admin.id]});
  await write('PUT','/api/roles','/api/roles',{userIds:previousAdmins.map(row=>row.user_id)});

  await write('POST','/api/teams','/api/teams',{id:home,name:`Contract Home ${prefix}`,tag:'CHM',pendingMembers:[striker.username]},captain.id);
  await write('PATCH','/api/teams/{id}',`/api/teams/${home}`,{description:'Contract edit'},captain.id);
  await write('POST','/api/teams/{id}/invitation',`/api/teams/${home}/invitation`,{accept:true},striker.id);
  await write('POST','/api/teams/{id}/review',`/api/teams/${home}/review`,{status:'approved'});
  await write('POST','/api/teams/{id}/membership',`/api/teams/${home}/membership`,{action:'leave'},striker.id);
  await write('POST','/api/teams/{id}/membership',`/api/teams/${home}/membership`,{action:'join'},striker.id);
  await write('POST','/api/teams','/api/teams',{id:away,name:`Contract Away ${prefix}`,tag:'CAW'},defender.id);
  await write('POST','/api/teams/{id}/review',`/api/teams/${away}/review`,{status:'approved'});
  await write('POST','/api/teams','/api/teams',{id:spare,name:`Contract Spare ${prefix}`,tag:'CSP'},midfielder.id);
  await write('DELETE','/api/teams/{id}',`/api/teams/${spare}`);
  const schedule = {season,week:1,homeTeamId:home,awayTeamId:away,status:'scheduled'};
  await write('POST','/api/schedule','/api/schedule',{...schedule,id:prefix+'_match'});
  await write('PATCH','/api/schedule/{id}',`/api/schedule/${prefix}_match`,{week:2});
  await write('DELETE','/api/schedule/{id}',`/api/schedule/${prefix}_match`);
  await write('POST','/api/schedule/bulk','/api/schedule/bulk',{matches:[{...schedule,id:prefix+'_bulk'}]});
  await write('PUT','/api/schedule/season/{season}',`/api/schedule/season/${season}`,{matches:[{id:prefix+'_replacement',week:1,homeTeamId:home,awayTeamId:away,status:'scheduled'}]});
  await write('DELETE','/api/schedule/season/{season}',`/api/schedule/season/${season}`);
  const transfer = prefix+'_transfer';
  await write('POST','/api/transfers','/api/transfers',{id:transfer,season,playerUsername:captain.username,fromTeamId:home,toTeamId:away,kind:'transfer'});
  await write('PATCH','/api/transfers/{id}',`/api/transfers/${transfer}`,{windowType:'cross_league'});
  await write('DELETE','/api/transfers/{id}',`/api/transfers/${transfer}`);

  const matchInfo = {homeTeamId:home,awayTeamId:away,homeScore:1,awayScore:0,date:Date.now(),season};
  const playerStats = [{username:captain.username,position:captain.position,goals:1},{username:defender.username,position:defender.position,goals:0}];
  const submitted = {matchInfo,playerStats};
  for(const suffix of ['approve','reject','delete']) await write('POST','/api/submissions','/api/submissions',{id:prefix+'_'+suffix,...submitted});
  await write('PATCH','/api/submissions/{id}',`/api/submissions/${prefix}_approve`,submitted);
  await write('POST','/api/submissions/{id}/approve',`/api/submissions/${prefix}_approve/approve`,submitted);
  await write('POST','/api/submissions/{id}/reject',`/api/submissions/${prefix}_reject/reject`,{reason:'Contract rejection'});
  await write('DELETE','/api/submissions/{id}',`/api/submissions/${prefix}_delete`);
  assert.equal((await db.client.submission.findUniqueOrThrow({where:{id:prefix+'_approve'}})).status,'approved');
  await write('POST','/api/match-imports','/api/match-imports',{
    homeTeamId:home,awayTeamId:away,season,playerMap:{one:captain.username},tackleOverrides:{},
    matchData:{match_id:prefix,score:{home:1,away:0},players:[{player_id:'one',username:captain.username,team:'home',stats:{goals:1}}]},
  });
  const period = (await write('POST','/api/voting/periods','/api/voting/periods',{closesAt:Date.now()+3_600_000,eligiblePlayers:[captain.username,striker.username,defender.username,midfielder.username]})).json();
  await owner.execute(Prisma.sql`UPDATE asl.totw_voting_periods SET opens_at=clock_timestamp()-interval '1 minute',closes_at=clock_timestamp()+interval '1 hour' WHERE id=${period.id}::uuid`);
  await write('PUT','/api/voting/periods/{id}/votes/me',`/api/voting/periods/${period.id}/votes/me`,{gk:captain.username,def:defender.username,cm:midfielder.username,st:striker.username});
  await write('PATCH','/api/voting/periods/{id}',`/api/voting/periods/${period.id}`,{status:'closed'});
  await write('DELETE','/api/voting/periods/{id}',`/api/voting/periods/${period.id}`);
  const expected = applicationOperations().filter(key=>!key.startsWith('GET ')&&key!=='POST /api/graphql'&&!content.test(key.slice(key.indexOf(' ')+1)));
  assert.equal(expected.length,35);
  assert.deepEqual([...c.covered].toSorted((a,b)=>a.localeCompare(b)),expected,'Every non-content mutation needs a successful contract exchange');
});
