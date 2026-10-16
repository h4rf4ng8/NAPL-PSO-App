import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../helper.js';
import { type Database, type Row, Prisma, connectDatabase } from '../../plugins/db/client.js';
import { accountDto } from '../../routes/accounts/dto.js';
import { aggregate } from '../../routes/matches/index.js';
import { InMemoryCache } from '@apollo/client';
import { print } from 'graphql';
import { MemberLeagueDataDocument, PublicLeagueDataDocument } from '../../../web/src/api/generated/graphql.ts';
import { MAX_SCHEDULE_MATCHES } from '@napl/contracts/league';
import { accountMatchPageSchema } from '@napl/contracts/accounts';
import { inStandings } from '../../../web/src/features/teams/selectors.js';
import type { Team } from '../../../web/src/features/teams/models.js';
import { mapAccount } from '../../../web/src/features/accounts/api.js';
import type { PublicAccountFieldsFragment } from '../../../web/src/api/generated/graphql.js';
const apolloCache = new InMemoryCache();
const PUBLIC_LEAGUE_QUERY = print(apolloCache.transformDocument(PublicLeagueDataDocument));
const MEMBER_LEAGUE_QUERY = print(apolloCache.transformDocument(MemberLeagueDataDocument));
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222', admin = '33333333-3333-4333-8333-333333333333', newUser = '44444444-4444-4444-8444-444444444444';
const verify = async (token: string) => {
    if (![alice, bob, admin, newUser].includes(token))
        throw new Error('bad token');
    return {
        id: token, sessionId: token, claims: {
            sub: token, email: 'new@example.test', user_metadata: {
                username: token === newUser ? 'sh1t' : 'Admin'
            }
        }
    };
};
test('public account fields omit private email and pending image', () => {
    const out = accountDto({
        id: alice, email: 'secret', pending_image_url: 'secret', username_lower: 'alice', username: 'Alice',private_note:'private production column'
    });
    assert.equal(out.email, undefined);
    assert.equal(out.pendingImageUrl, undefined);
    assert.equal(out.usernameLower, undefined);
    assert.equal(out.privateNote,undefined);
});
test('match aggregates recompute each result and numeric stat', () => {
    assert.deepEqual(aggregate([{
            result: 'W', goals: 2, cleanSheet: true
        }, {
            result: 'L', assists: 1, motm: true
        }]), {
        games: 2, wins: 1, draws: 0, losses: 1, goals: 2, assists: 1, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 1, motm: 1
    });
});
test('unlisted routes and mutations require identity by default', async () => {
    const database: Database = {
        client: { setting: { findUnique: async () => null } } as unknown as Prisma.TransactionClient,
        query: async <T extends Row>() => [] as T[], execute: async () => 0, transaction: async (work) => work(database), close: async () => {}
    };
    const app = createApp({
        db: database, verify
    });
    try {
        assert.equal((await app.inject('/api/no-such-route')).statusCode, 401);
        assert.equal((await app.inject('/api/accounts')).statusCode, 200);
        assert.equal((await app.inject({
            url: '/api/accounts', headers: {
                authorization: 'Bearer forged'
            }
        })).statusCode, 401);
        assert.equal((await app.inject({
            url: '/api/teams', method: 'POST', payload: {}
        })).statusCode, 401);
    }
    finally {
        await app.close();
    }
});
test('revoked sessions cannot mutate or use administrative reads', async () => {
    const database: Database = {
        query: async <T extends Row>(sql: Prisma.Sql) => {
            let rows: Row[] = [];
            if (sql.sql.includes('FROM auth_gateway.memberships')) rows = [{eligible:true,fresh:true}];
            if (sql.sql.includes('FROM auth_gateway.user_roles')) rows = [{role:'super_admin'}];
            if (sql.sql.includes('session_active')) rows = [{active:false}];
            return rows as T[];
        },
        execute: async () => {throw new Error('A revoked session must not write');},
        transaction: async work => work(database),
        close: async () => {}
    };
    const app=createApp({db:database,verify});
    try {
        for (const request of [{method:'GET' as const,url:`/api/accounts/id/${alice}`},{method:'PATCH' as const,url:`/api/accounts/${alice}`,payload:{cheater:true}}]) {
            const response=await app.inject({...request,headers:{authorization:`Bearer ${admin}`}});
            assert.equal(response.statusCode,401);
            assert.equal(response.json<{error:string}>().error,'session_expired');
        }
    } finally {await app.close();}
});
test('Prisma adapter serialization and uniqueness conflicts are explicit 409 responses', async () => {
    for(const sqlState of ['40001','40P01','23505']) {
      for (const direct of [false, true]) {
        const database:Database={
            query:async()=>{throw Object.assign(new Error('private query detail'), direct
                ? { name: 'DriverAdapterError', cause: { originalCode: sqlState } }
                : {code:'P2010',meta:{driverAdapterError:{cause:{originalCode:sqlState}}}});},
            execute:async()=>0,transaction:async work=>work(database),close:async()=>{}
        };
        const app=createApp({db:database,verify});
        try{const response=await app.inject('/api/accounts');assert.equal(response.statusCode,409);assert.equal(response.body.includes('private query detail'),false);}finally{await app.close();}
      }
    }
});
test('real PostgreSQL authorization, atomic commands and cutover', {
    skip: !process.env.API_TEST_DATABASE_URL
}, async t => {
    const database = connectDatabase(process.env.API_TEST_DATABASE_URL!);
    const app = createApp({
        db: database, verify
    });
    const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, user?: string, payload?: object) => app.inject({
        method, url, headers: user ? {
            authorization: `Bearer ${user}`
        } : {}, ...(payload && {
            payload
        })
    });
    const ok = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, user?: string, payload?: object) => {
        const response = await call(method, url, user, payload);
        assert.equal(response.statusCode, 200, `${method} ${url}: ${response.body}`);
        return response.json<Record<string, unknown>>();
    };
    try {
        const rows = await database.query(Prisma.sql `SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`);
        assert.equal(rows[0]?.rolsuper, false);
        assert.equal(rows[0]?.rolbypassrls, false);
        const publicResponse = await call('GET', '/api/accounts');
        assert.equal(publicResponse.statusCode, 200);
        assert.equal(publicResponse.body.includes('@private.test'), false);
        assert.equal((await call('GET', `/api/accounts/id/${bob}`, alice)).statusCode, 403);
        assert.equal((await call('PATCH', `/api/accounts/${bob}`, alice, {
            country: 'US'
        })).statusCode, 403);
        assert.equal((await call('PATCH', `/api/accounts/${alice}`, alice, {
            cheater: false
        })).statusCode, 400);
        assert.equal((await call('PATCH', `/api/accounts/${alice}`, alice, {
            teamId: 'forged'
        })).statusCode, 400);
        assert.equal((await call('PUT', '/api/roles', alice, {
            userIds: [alice]
        })).statusCode, 403);
        await t.test('account writes reject malformed records and decode with shared browser schemas', async () => {
            for (const field of ['matches', 'championships']) {
                assert.equal((await call('PATCH', `/api/accounts/${bob}`, admin, { [field]: [{}] })).statusCode, 400);
            }
            const match = { id: 'legacy_match', date: 1, season: 'S0', opponent: 'Legacy', result: 'W', goals: 1, assists: 0,
                passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: false, motm: 1, strikersMatchId: 123, historicalField: 'kept' };
            const secondMatch = { ...match, id: 'legacy_match_second', date: 2, strikersMatchId: 124 };
            const otherSeasonMatch = { ...match, id: 'legacy_match_other_season', season: 'S1', date: 3, strikersMatchId: 125 };
            const championship = { season: 'S0', placement: '1st', teamId: 'legacy_team', awardedAt: 1, historicalField: 'kept' };
            await ok('PATCH', `/api/accounts/${bob}`, admin, { matches: [match, secondMatch, otherSeasonMatch], championships: [championship] });
            const response = await call('POST', '/api/graphql', undefined, { query: PUBLIC_LEAGUE_QUERY });
            const result = response.json<{ errors?: unknown; data: { accounts: PublicAccountFieldsFragment[] } }>();
            assert.equal(result.errors, undefined);
            const decoded = mapAccount(result.data.accounts.find(account => account.id === bob)!);
            assert.deepEqual(decoded.matches, []);
            assert.equal(decoded.seasonStats?.S0?.games, 2);
            assert.equal(decoded.seasonStats?.S1?.games, 1);
            assert.deepEqual(decoded.championships, [championship]);
            const firstResponse = await call('POST', '/api/graphql', undefined, { query: `{
              accountMatches(id: "${bob}", first: 1, season: "S0") { nodes pageInfo { endCursor hasNextPage } }
            }` });
            assert.equal(firstResponse.statusCode, 200, firstResponse.body);
            const firstPage = accountMatchPageSchema.parse(firstResponse.json<{ data: { accountMatches: unknown } }>().data.accountMatches);
            assert.equal(firstPage.nodes[0]?.strikersMatchId, '123');
            assert.equal(firstPage.nodes[0]?.historicalField, 'kept');
            assert.equal(firstPage.pageInfo.hasNextPage, true);
            assert.ok(firstPage.pageInfo.endCursor);
            const secondResponse = await call('POST', '/api/graphql', undefined, {
                query: 'query($after:String){ accountMatches(id:"' + bob + '",first:1,season:"S0",after:$after){nodes pageInfo {endCursor hasNextPage}} }',
                variables: { after: firstPage.pageInfo.endCursor },
            });
            const secondPage = accountMatchPageSchema.parse(secondResponse.json<{ data: { accountMatches: unknown } }>().data.accountMatches);
            assert.equal(secondPage.nodes[0]?.id, 'legacy_match_second');
            assert.equal(secondPage.pageInfo.hasNextPage, false);
            await ok('PATCH', `/api/accounts/${bob}`, admin, { country: 'US' });
            const stale = await call('POST', '/api/graphql', undefined, {
                query: 'query($after:String){ accountMatches(id:"' + bob + '",first:1,season:"S0",after:$after){nodes pageInfo {endCursor hasNextPage}} }',
                variables: { after: firstPage.pageInfo.endCursor },
            });
            assert.equal(stale.statusCode, 409, stale.body);
            assert.equal(stale.json<{ errors: Array<{ extensions: { code: string } }> }>().errors[0]?.extensions.code, 'stale_cursor');
            await ok('PATCH', `/api/accounts/${bob}`, admin, { matches: [], championships: [] });
        });
        await t.test('nullable and empty news survives REST and the combined dashboard query', async () => {
            for (const title of [null, '']) {
                const saved = await ok('POST', '/api/news', admin, { id: 'nullable_news', type: 'announcement', title, body: title });
                assert.equal(saved.title, '');
                assert.equal(saved.body, '');
                await database.execute(Prisma.sql `UPDATE public.news SET author=NULL, notes=NULL WHERE id='nullable_news'`);
                const news = (await call('GET', '/api/news')).json<Row[]>().find(row => row.id === 'nullable_news');
                assert.equal(news?.author, '');
                const response = await call('POST', '/api/graphql', alice, { query: MEMBER_LEAGUE_QUERY });
                const result = response.json<{ errors?: unknown; data: { news: Row[]; me: Row } }>();
                assert.equal(result.errors, undefined, response.body);
                assert.equal(result.data.me.id, alice);
                const projected = result.data.news.find(row => row.id === 'nullable_news');
                assert.equal(projected?.title, '');
                assert.equal(projected?.body, '');
                assert.equal(projected?.author, '');
            }
        });
        await ok('PATCH', `/api/accounts/${alice}`, alice, {
            country: 'US'
        });
        assert.equal((await ok('GET', '/api/users/me', alice)).email, 'alice@private.test');
        const provision = await ok('POST', '/api/users/me', newUser, {});
        assert.equal(provision.id, newUser);
        assert.equal(provision.username, 'Player');
        assert.deepEqual(provision.roles, []);
        assert.equal((await ok('POST', '/api/users/me', newUser, {})).id, newUser);
        assert.equal((await call('POST', `/api/accounts/${newUser}/rename`, newUser, { username: 'Sh1t' })).statusCode, 400);
        assert.equal((await call('POST', `/api/accounts/${alice}/rename`, bob, { username: 'Alicia' })).statusCode, 403);
        await ok('POST', `/api/accounts/${newUser}/rename`, admin, { username: 'Cunt' });
        await ok('POST', `/api/accounts/${newUser}/rename`, admin, { username: 'Player' });
        assert.equal((await call('POST','/api/teams',alice,{id:'blocked_name',name:'F_u_c_k FC',tag:'FUK'})).statusCode,400);
        assert.equal((await call('POST','/api/teams',alice,{id:'blocked_tag',name:'Fine Team',tag:'SH1T'})).statusCode,400);
        assert.equal((await call('POST','/api/teams',alice,{id:'bad_lineup',name:'Invalid Team',tag:'BAD',lineup:{gk:'Bob'}})).statusCode,400);
        await ok('POST', '/api/teams', alice, {
            id: 'home', name: 'Home Team', tag: 'HOME', pendingMembers: ['Bob']
        });
        assert.equal((await ok('GET','/api/teams/home',bob)).status,'pending');
        assert.deepEqual((await ok('GET','/api/teams/home',alice)).seasons,[]);
        await ok('POST', '/api/teams/home/review', admin, {
            status: 'approved'
        });
        const blockedTeamUpdate = await call('PATCH', '/api/teams/home', admin, { name: 'Scunthorpe United', tag: 'FUCK' });
        assert.equal(blockedTeamUpdate.statusCode, 400);
        assert.match(blockedTeamUpdate.json<{ message: string }>().message, /team name or tag/i);
        assert.equal((await ok('GET', '/api/teams/home')).name, 'Home Team');
        await t.test('new teams participate in current-season standings and admin exclusions persist', async () => {
            const readTeam = async () => (await call('GET', '/api/teams/home', alice)).json<Team>();
            assert.equal(inStandings(await readTeam(), 'S1'), true);
            assert.equal((await call('PATCH', '/api/teams/home', alice, { seasons: ['S1'] })).statusCode, 403);
            await ok('PATCH', '/api/teams/home', admin, { seasons: ['S1'] });
            await ok('PATCH', '/api/teams/home', alice, { description: 'Updated profile' });
            assert.deepEqual((await readTeam()).seasons, ['S1']);
            assert.equal(inStandings(await readTeam(), 'S1'), false);
            assert.equal(inStandings(await readTeam(), 'S2'), true);
            assert.equal(inStandings(await readTeam(), 'all'), true);
            await ok('PATCH', '/api/teams/home', admin, { seasons: [] });
            const excluded = await ok('POST', '/api/teams', admin, { id: 'admin_excluded', name: 'Excluded Team', tag: 'EXC', seasons: ['S1'] });
            assert.deepEqual(excluded.seasons, ['S1']);
        });
        await ok('POST', '/api/teams', bob, {
            id: 'away', name: 'Away Team', tag: 'AWAY'
        });
        await ok('POST', '/api/teams/away/review', admin, {
            status: 'approved'
        });
        await t.test('content CRUD keeps public reads, admin writes, field mappings and server metadata', async () => {
            const date = 1_700_000_000_000;
            const fixtures = [
                { path: 'news', input: { id: 'content_news', type: 'result', title: 'Before', body: 'Body', pinned: true, homeTeamId: 'home', awayTeamId: 'away', homeScore: 2, awayScore: 1, date, notes: 'Note', autoFromSubmission: 'source' }, patch: { title: null, date: null }, expected: { title: '', date: null, body: 'Body', homeScore: 2, autoFromSubmission: 'source' } },
                { path: 'rules', input: { id: 'content_rules', title: 'Before', body: 'Body', sortOrder: 7 }, patch: { title: 'After', body: 'Updated body', sortOrder: 3 }, expected: { title: 'After', body: 'Updated body', sortOrder: 3 } },
                { path: 'articles', input: { id: 'content_article', slug: 'content-article', title: 'Before', body: 'Body', coverImageUrl: 'https://example.test/cover.png', excerpt: 'Excerpt', publishedAt: date }, patch: { title: 'After', body: 'Updated body', publishedAt: null }, expected: { title: 'After', body: 'Updated body', publishedAt: null, excerpt: 'Excerpt', coverImageUrl: 'https://example.test/cover.png' } },
                { path: 'schedule', input: { id: 'content_schedule', season: 'Content test', week: 1, homeTeamId: 'home', awayTeamId: 'away', scheduledDate: date, streamUrl: 'https://example.test/live', matchType: 'playoff', playoffRound: 'Final', status: 'completed', homeScore: 2, awayScore: 1, linkedMatchId: 'source', notes: 'Note' }, patch: { week: 2, scheduledDate: null }, expected: { week: 2, scheduledDate: null, streamUrl: 'https://example.test/live', playoffRound: 'Final', homeScore: 2, linkedMatchId: 'source', notes: 'Note' } },
            ];
            for (const fixture of fixtures) {
                const url = `/api/${fixture.path}`, itemUrl = `${url}/${fixture.input.id}`;
                for (const user of [undefined, alice]) {
                    const denied = user ? 403 : 401;
                    assert.equal((await call('POST', url, user, fixture.input)).statusCode, denied);
                    assert.equal((await call('PATCH', itemUrl, user, fixture.patch)).statusCode, denied);
                    assert.equal((await call('DELETE', itemUrl, user)).statusCode, denied);
                }
                assert.equal((await call('POST', url, admin, { ...fixture.input, author: 'Forged' })).statusCode, 400);
                const before = Date.now();
                const saved = await ok('POST', url, admin, fixture.input);
                assert.equal(saved.id, fixture.input.id);
                if (fixture.path !== 'news') assert.ok(Number(saved.updatedAt) >= before);
                if (fixture.path === 'news' || fixture.path === 'articles') assert.equal(saved.author, 'Admin');
                if (fixture.path === 'news') await database.execute(Prisma.sql`UPDATE public.news SET author='Original writer' WHERE id=${fixture.input.id}`);
                else if (fixture.path === 'articles') await database.execute(Prisma.sql`UPDATE public.articles SET author='Original writer' WHERE id=${fixture.input.id}`);
                assert.equal((await call('PATCH', itemUrl, admin, { id: 'forged', ...fixture.patch })).statusCode, 400);
                const patched = await ok('PATCH', itemUrl, admin, fixture.patch);
                for (const [key, value] of Object.entries(fixture.expected)) assert.deepEqual(patched[key], value, `${fixture.path}.${key}`);
                if (saved.createdAt !== undefined) assert.equal(patched.createdAt, saved.createdAt);
                if (fixture.path !== 'news') assert.ok(Number(patched.updatedAt) >= Number(saved.updatedAt));
                if (fixture.path === 'news' || fixture.path === 'articles') assert.equal(patched.author, 'Original writer');
                const listed = (await call('GET', url)).json<Row[]>();
                assert.deepEqual(listed.find(row => row.id === fixture.input.id), patched);
                if (fixture.path === 'articles') assert.deepEqual(await ok('GET', '/api/articles/slug/content-article'), patched);
                const replaced = await ok('POST', url, admin, fixture.input);
                if (fixture.path === 'news' || fixture.path === 'articles') assert.equal(replaced.author, 'Admin');
                assert.equal((await call('GET', url)).json<Row[]>().filter(row => row.id === fixture.input.id).length, 1);
                assert.deepEqual(await ok('DELETE', itemUrl, admin), { ok: true });
                assert.equal((await call('GET', url)).json<Row[]>().some(row => row.id === fixture.input.id), false);
                assert.equal((await call('PATCH', itemUrl, admin, fixture.patch)).statusCode, 404);
            }
        });
        await t.test('schedule replacement validates before writing and rolls back partial inserts', async () => {
            const season = 'Replacement test';
            const url = `/api/schedule/season/${encodeURIComponent(season)}`;
            const fixture = { week: 1, homeTeamId: 'home', awayTeamId: 'away', scheduledDate: 1_700_000_000_000, status: 'completed', homeScore: 2, awayScore: 1, notes: 'Keep the date, score and notes on failure.' };
            await ok('POST', '/api/schedule/bulk', admin, { matches: [
                { ...fixture, id: 'schedule_original', season },
                { ...fixture, id: 'schedule_other', season: 'Untouched season' }
            ] });
            const readSeason = async (name: string) => (await call('GET', `/api/schedule?season=${encodeURIComponent(name)}`)).json<Row[]>();
            const original = await readSeason(season);
            const other = await readSeason('Untouched season');
            const replacement = [{ ...fixture, id: 'schedule_replacement' }];
            assert.equal((await call('PUT', url, undefined, { matches: replacement })).statusCode, 401);
            assert.equal((await call('PUT', url, alice, { matches: replacement })).statusCode, 403);
            for (const matches of [[], Array.from({ length: MAX_SCHEDULE_MATCHES + 50 }, (_, index) => ({ ...fixture, id: `oversized_${index}` })), [{ ...fixture, id: 'forged_season', season: 'Untouched season' }]]) {
                assert.equal((await call('PUT', url, admin, { matches })).statusCode, 400);
                assert.deepEqual(await readSeason(season), original);
            }
            assert.equal((await call('PUT', '/api/schedule/season/%20', admin, { matches: replacement })).statusCode, 400);
            const response = await call('PUT', url, admin, { matches: replacement });
            assert.equal(response.statusCode, 200, response.body);
            const saved = response.json<Row[]>();
            assert.equal(saved[0]?.season, season);
            assert.equal(saved[0]?.id, 'schedule_replacement');
            assert.deepEqual(await readSeason(season), saved);
            assert.deepEqual(await readSeason('Untouched season'), other);
            const conflict = await call('PUT', url, admin, { matches: [
                { ...fixture, id: 'schedule_partial_insert' },
                { ...fixture, id: 'schedule_other' }
            ] });
            assert.equal(conflict.statusCode, 409, conflict.body);
            assert.deepEqual(await readSeason(season), saved);
            assert.deepEqual(await readSeason('Untouched season'), other);
            assert.equal((await database.query(Prisma.sql `SELECT id FROM public.scheduled_matches WHERE id='schedule_partial_insert'`)).length, 0);
        });
        await t.test('concurrent schedule replacements keep one complete schedule', async () => {
            const season = 'Concurrent replacement';
            const url = `/api/schedule/season/${encodeURIComponent(season)}`;
            const fixture = { week: 1, homeTeamId: 'home', awayTeamId: 'away' };
            await ok('POST', '/api/schedule', admin, { ...fixture, id: 'schedule_concurrent_original', season });
            const versions = ['a', 'b'].map(version => Array.from({ length: 20 }, (_, index) => ({ ...fixture, id: `schedule_concurrent_${version}_${index}` })));
            const responses = await Promise.all(versions.map(matches => call('PUT', url, admin, { matches })));
            assert.ok(responses.some(response => response.statusCode === 200));
            assert.ok(responses.every(response => [200, 409].includes(response.statusCode)), responses.map(response => response.body).join('\n'));
            const saved = (await call('GET', `/api/schedule?season=${encodeURIComponent(season)}`)).json<Row[]>();
            const savedIds = saved.map(row => String(row.id)).toSorted((a, b) => a.localeCompare(b));
            assert.equal(saved.length, 20);
            assert.ok(versions.some((matches, index) => responses[index]?.statusCode === 200 && JSON.stringify(matches.map(match => match.id).toSorted((a, b) => a.localeCompare(b))) === JSON.stringify(savedIds)), JSON.stringify(savedIds));
        });
        const publicLeague = await call('POST', '/api/graphql', undefined, { query: PUBLIC_LEAGUE_QUERY });
        assert.equal(publicLeague.statusCode, 200, publicLeague.body);
        const publicData = publicLeague.json<{ data: { accounts: Array<Record<string, unknown>>; teams: Array<Record<string, unknown>> } }>().data;
        assert.ok(publicData.accounts.some(account => account.username === 'Alice'));
        assert.equal(publicData.accounts.find(account => account.username === 'Alice')?.email, undefined);
        assert.deepEqual(publicData.teams.map(team => String(team.name)).toSorted((a, b) => a.localeCompare(b)), ['Away Team', 'Home Team']);
        const memberLeague = await call('POST', '/api/graphql', alice, {
            query: MEMBER_LEAGUE_QUERY,
        });
        assert.equal(memberLeague.statusCode, 200, memberLeague.body);
        const memberData = memberLeague.json<{ data: { me: { email: string }; admins?: unknown } }>().data;
        assert.equal(memberData.me.email, 'alice@private.test');
        assert.equal('weightings' in memberData, false);
        assert.equal(memberData.admins, undefined);
        assert.equal((await call('PATCH', '/api/teams/home', bob, {
            name: 'Taken over'
        })).statusCode, 403);
        assert.equal((await call('PATCH', '/api/teams/home', alice, {
            lineup: {
                gk: 'Bob'
            }
        })).statusCode, 400);
        const info = {
            homeTeamId: 'home', awayTeamId: 'away', homeScore: 2, awayScore: 1, date: Date.now(), season: 'S1'
        }, players = [{
                username: 'Alice', position: 'GK', goals: 0, cleanSheet: false
            }, {
                username: 'Bob', position: 'ST', goals: 1, cleanSheet: false
            }];
        await ok('POST', '/api/submissions', admin, {
            id: 'match', matchInfo: info, playerStats: players
        });
        const results = await Promise.all([call('POST', '/api/submissions/match/approve', admin, {
                matchInfo: info, playerStats: players
            }), call('POST', '/api/submissions/match/approve', admin, {
                matchInfo: info, playerStats: players
            })]);
        assert.ok(results.every(r => [200, 409].includes(r.statusCode)), results.map(r => r.body).join('\n'));
        await ok('POST', '/api/submissions/match/approve', admin, {
            matchInfo: info, playerStats: players
        });
        const after = await ok('GET', '/api/accounts/Alice');
        assert.equal((after.matches as unknown[]).length, 1);
        await ok('POST', '/api/submissions', admin, {
            id: 'broken', matchInfo: info, playerStats: [players[0], {
                    username: 'Missing', position: 'ST'
                }]
        });
        assert.equal((await call('POST', '/api/submissions/broken/approve', admin, {
            matchInfo: info, playerStats: [players[0], {
                    username: 'Missing', position: 'ST'
                }]
        })).statusCode, 409);
        assert.equal(((await ok('GET', '/api/accounts/Alice')).matches as unknown[]).length, 1);
        const request = await ok('POST', '/api/position-requests', alice, {
            toPos: 'DEF'
        });
        await ok('POST', `/api/position-requests/${request.id}/review`, admin, {
            status: 'approved'
        });
        assert.equal((await ok('GET', '/api/accounts/Alice')).position, 'DEF');
        const period = await ok('POST', '/api/voting/periods', admin, {
            closesAt: Date.now() + 60_000, eligiblePlayers: ['Alice', 'Bob', 'Admin','Goalie']
        });
        const [voteClock] = await database.query(Prisma.sql `SELECT clock_timestamp() AS database_now`);
        const selfVote = await call('PUT', `/api/voting/periods/${period.id}/votes`, alice, {
            gk: 'Alice', def: 'Alice', cm: 'Admin', st: 'Bob'
        });
        assert.equal(selfVote.statusCode, 400, `Expected self-vote validation, received ${selfVote.statusCode} ${selfVote.body}; app=${Date.now()} database=${voteClock?.database_now instanceof Date ? voteClock.database_now.toISOString() : voteClock?.database_now} opensAt=${period.opensAt} closesAt=${period.closesAt}`);
        assert.equal(selfVote.json<{ error: string }>().error, 'ineligible_vote');
        assert.equal((await database.query(Prisma.sql `SELECT * FROM public.totw_votes`)).length, 0);
        const votes={gk:'Goalie',def:'Alice',cm:'Admin',st:'Bob'};
        await ok('PUT',`/api/voting/periods/${period.id}/votes`,newUser,votes);
        await ok('PUT',`/api/voting/periods/${period.id}/votes`,newUser,votes);
        assert.equal((await database.query(Prisma.sql `SELECT * FROM public.totw_votes`)).length,4);
        assert.equal((await call('PUT',`/api/voting/periods/${period.id}/votes`,newUser,{...votes,gk:'Bob'})).statusCode,400);
        assert.equal((await database.query(Prisma.sql `SELECT * FROM public.totw_votes`)).length,4);
        const champions={S1:{winnerTeamId:'home',runnerUpTeamId:'away',setAt:Date.now()}};
        await ok('PUT','/api/settings/season_champions',admin,{value:champions});
        assert.equal(((await ok('GET','/api/accounts/Alice')).championships as unknown[]).length,1);
        const brokenChampions={S1:{winnerTeamId:'missing',runnerUpTeamId:'away',setAt:Date.now()}};
        assert.equal((await call('PUT','/api/settings/season_champions',admin,{value:brokenChampions})).statusCode,404);
        assert.deepEqual(await ok('GET','/api/settings/season_champions'),champions);
        const imported={matchData:{match_id:'strikers_1',score:{home:2,away:0},players:[{player_id:'123',username:'Alice',team:'home',stats:{goals:2}}]},playerMap:{'123':'Alice'},tackleOverrides:{},homeTeamId:'home',awayTeamId:'away',season:'S1'};
        assert.equal((await ok('POST','/api/import-match',admin,imported)).updated,1);
        assert.equal((await ok('POST','/api/import-match',admin,imported)).alreadyImported,1);
        await ok('POST', `/api/accounts/${alice}/rename`, alice, {
            username: 'Alicia'
        });
        assert.equal((await ok('GET', '/api/teams/home')).ownerUsername, 'Alicia');
        const grants = await database.query(Prisma.sql `SELECT has_table_privilege('authenticated','public.accounts','UPDATE') AS writable,has_table_privilege('anon','public.accounts','SELECT') AS readable`);
        assert.equal(grants[0]?.writable, false);
        assert.equal(grants[0]?.readable, false);
    }
    finally {
        await app.close();
        await database.close();
    }
});
