import { connectDatabase, Prisma } from '../../plugins/db/client.js';
import { payloadFixture, fixtureUser } from '../payload-fixture.js';

// Only called against the throwaway Docker database created by the benchmark runner.
const db = connectDatabase(process.env.PAYLOAD_BENCHMARK_ADMIN_URL);
const fixture = payloadFixture();
if (process.env.PAYLOAD_BENCHMARK_SCENARIO === 'routine') {
  const image = 'data:image/png;base64,' + Buffer.from('routine image bytes'.repeat(200)).toString('base64');
  for (const account of fixture.accounts) {
    account.image_url = image; account.pending_image_url = image; account.steam_url = 'https://example.test/profile';
    account.matches = account.matches.slice(0,12).map(({extension,...match}) => ({...match,extension:typeof extension === 'object' ? extension : {imported:true}}));
    account.awards = account.awards.slice(0,2).map(award => ({...award,extension:''}));
  }
  for (const team of fixture.teams) { team.logo_url = image; team.description = 'Routine team description'; team.rejection_reason = ''; }
  fixture.news.splice(12);
  for (const item of fixture.news) { item.body = 'Routine league update. '.repeat(12); item.notes = ''; }
  for (const item of fixture.rules) item.body = 'Routine rule text. '.repeat(30);
  for (const item of fixture.articles) { item.body = 'Routine article text. '.repeat(30); item.excerpt = 'Article excerpt'; item.cover_image_url = image; }
}
try {
  const ids = fixture.accounts.map(row => row.id);
  await db.execute(Prisma.sql`INSERT INTO auth.users(id) SELECT unnest(${ids}::uuid[])`);
  await db.execute(Prisma.sql`INSERT INTO auth.sessions(id,user_id) SELECT id,id FROM auth.users`);
  await db.execute(Prisma.sql`INSERT INTO auth_gateway.user_roles(user_id,role) VALUES(${fixtureUser}::uuid,'super_admin')`);
  await db.client.account.createMany({data:fixture.accounts.map(row => { const data = {...row,team_id:null}; delete data.season_stats; return data; })});
  await db.client.season.createMany({data:['S1','S2','S3'].map(id => ({id})),skipDuplicates:true});
  await db.client.team.createMany({data:fixture.teams});
  await db.client.teamSeason.createMany({data:fixture.teams.flatMap(team => ['S1','S2','S3'].map(season_id => ({team_id:team.id,season_id})))});
  for (const team of fixture.teams) await db.client.account.updateMany({where:{id:{in:fixture.accounts.filter(row => row.team_id === team.id).map(row => row.id)}},data:{team_id:team.id}});
  await db.client.news.createMany({data:fixture.news});
  await db.client.ruleSection.createMany({data:fixture.rules});
  await db.client.article.createMany({data:fixture.articles});
  await db.client.setting.upsert({where:{key:'current_season'},create:{key:'current_season',value:'S2'},update:{value:'S2'}});
  await db.client.totwVotingPeriod.create({data:fixture.period});
  await db.client.totwCandidate.createMany({data:fixture.accounts.map(account => ({period_id:fixture.period.id,account_id:account.id,position:'CM'}))});
} finally { await db.close(); }
