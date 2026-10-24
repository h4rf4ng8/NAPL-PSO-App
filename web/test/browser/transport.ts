import { readFile } from 'node:fs/promises';
import type { Page, Request } from '@playwright/test';
import { session } from '../session-fixture';
import { article, candidateCards, championship, currentCard, fullTeam, news, opponent, pageOf, period, playedMatch, playerAward, positionRequest, rule, scheduledMatch, stats, team, teamSummary, transfer, type FixtureRole } from './league-data';

const placeholder = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="16" fill="#1d4ed8"/><path d="M48 14 76 25v25c0 15-13 27-28 33C33 77 20 65 20 50V25Z" fill="#fff"/><path d="m48 28 18 30H30Z" fill="#1d4ed8"/></svg>';
const fields = (value: Record<string, unknown>) => pageOf(Object.entries(value).map(([key, value], index) => ({ index, key, value })));

// Intercepts the real app's transport; no test may contact a hosted API or auth service.
export async function installLeagueFixture(page: Page, role: FixtureRole = 'visitor') {
  const card = currentCard(role);
  const fixture = {
    requests: [] as { operation: string; method: string; body: unknown; authorization: string | null }[],
    unexpected: [] as string[],
    failures: new Set<string>(),
    holds: new Map<string, Promise<void>>(),
    paginated: new Set<string>(),
    empty: false,
    votingOpen: true,
    votes: [] as { voterUsername: string; position: string; votedForUsername: string }[],
    responses: new Map<string, (request: Request) => unknown | Promise<unknown>>(),
    account: card,
    authSession: session(card.id),
  };
  await page.addInitScript(({ value }) => {
    if (value) localStorage.setItem('napl-auth', JSON.stringify(value));
    else localStorage.removeItem('napl-auth');
  }, { value: role === 'visitor' ? null : session(card.id) });

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const local = url.origin === 'http://127.0.0.1:4174';
    if (local && !path.startsWith('/api/')) return route.continue();
    if (path.includes('/storage/v1/object/public/')) {
      const hash = path.match(/([a-f\d]{64})\.(png|woff2|webp|jpg|svg)$/);
      if (hash && process.env.BROWSER_ASSET_CACHE) {
        try {
          return await route.fulfill({ body: await readFile(`${process.env.BROWSER_ASSET_CACHE}/${hash[1]}.bin`), contentType: hash[2] === 'woff2' ? 'font/woff2' : `image/${hash[2]}`, headers: { 'access-control-allow-origin': '*' } });
        } catch { /* Portable runs use synthetic artwork and system font fallbacks. */ }
      }
      return route.fulfill(path.endsWith('.woff2') ? { status: 204 } : { body: placeholder, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.hostname === 'fixture.supabase.test' && path.startsWith('/auth/')) {
      await fixture.holds.get(path);
      if (fixture.failures.has(path)) return route.fulfill({ status: 503, json: { message: 'Fixture auth unavailable' } });
      return route.fulfill(path.endsWith('/logout') ? { status: 204 } : { json: fixture.authSession });
    }
    if (!local) {
      fixture.unexpected.push(request.url());
      return route.abort('blockedbyclient');
    }
    const body = request.postDataJSON() as { operationName?: string; variables?: Record<string, unknown> } | null;
    const operation = path === '/api/graphql' ? body?.operationName ?? 'unknown' : path;
    fixture.requests.push({ operation, method: request.method(), body, authorization: request.headers().authorization ?? null });
    await fixture.holds.get(operation);
    if (fixture.failures.has(operation)) return route.fulfill({ status: 503, json: { error: 'fixture_unavailable', message: 'Fixture temporarily unavailable. Try again.' } });
    const respond = fixture.responses.get(operation);
    if (respond) return route.fulfill({ json: await respond(request) });
    const variables = body?.variables ?? {};
    const after = variables.after ?? url.searchParams.get('after');
    const rows = (nodes: unknown[], type?: string) => {
      if (fixture.empty) return pageOf([], type);
      const all = pageOf(nodes, type);
      return fixture.paginated.has(operation) ? { ...all, nodes: after ? nodes.slice(1) : nodes.slice(0, 1), pageInfo: { ...all.pageInfo, endCursor: after ? null : 'fixture-next-page', hasNextPage: !after } } : all;
    };
    if (path === '/api/graphql') {
      const account = { ...card, __typename: 'AccountCard' };
      const summary = { ...card, __typename: 'AccountSummary' };
      const graph: Record<string, unknown> = {
        LeagueOverview: { leagueOverview: { __typename: 'LeagueOverview', season: 'S1', playerCount: 24, activeTeamCount: 2, me: { ...card, season: variables.season ?? 'all' }, tickerHasMore: false, tickerNews: [], activeVotingPeriod: fixture.votingOpen ? { ...period, __typename: 'VotingPeriodSummary' } : null } },
        Seasons: { seasons: { ...rows(['S1'], 'StringPage'), summaries: [{ games: 12, players: 24 }] } },
        TeamSummaries: { teamSummaries: rows((variables.status && variables.status !== 'approved' ? [{ ...teamSummary(), status: variables.status }] : [teamSummary(), teamSummary(opponent)]).filter(value => !variables.search || value.name.toLowerCase().includes(String(variables.search).toLowerCase())), 'TeamSummaryPage') },
        Leaderboard: { leaderboard: rows([summary, ...candidateCards().map(value => ({ ...value, __typename: 'AccountSummary' }))].filter(value => !variables.position || value.position === variables.position), 'AccountSummaryPage') },
        PlayerCard: { accountCard: { ...account, season: variables.season ?? 'all' } },
        TeamPlayers: { teamPlayers: rows([account], 'AccountCardPage') },
        HomeSummary: { homeSummary: { playerCount: 24, activeTeamCount: 2, topPlayers: fixture.empty ? [] : [summary] } },
        HomeNews: { homeNews: rows([news(String(variables.kind))]) },
        TeamStandings: { standings: rows([{ rank: 1, team, played: 12, w: 8, d: 2, l: 2, gf: 24, ga: 9, gd: 15, pts: 26 }]) },
        TeamRecords: { teamRecords: rows([{ teamId: team.id, season: 'S1', played: 12, w: 8, d: 2, l: 2, gf: 24, ga: 9, gd: 15, pts: 26 }]) },
        HallOfFame: { hallOfFame: rows([{ player: summary, award: { awardId: 'striker', season: 'S1' } }]) },
        DecoratedPlayers: { decoratedPlayers: rows([{ player: summary, count: 2 }]) },
        SeasonChampions: { seasonChampions: rows([{ season: 'S1', winnerTeam: team, runnerUpTeam: opponent }]) },
        AccountAwards: { accountAwards: rows([playerAward]) },
        AccountChampionships: { accountChampionships: rows([championship]) },
        AccountMatches: { accountMatches: rows([playedMatch]) },
        AccountOpponents: { accountOpponents: rows([{ opponent: opponent.name, games: 1, w: 1, d: 0, l: 0, goals: 3, assists: 1, motm: 1 }]) },
        VotingCandidates: { votingCandidates: rows(candidateCards().filter(value => !variables.position || value.position === variables.position).map(value => ({ ...value, __typename: 'AccountSummary' })), 'AccountSummaryPage') },
        AccountCardPreviews: { accountCardPreviews: fixture.empty ? [] : [{ label: 'Gold striker', description: 'A server-calculated preview.', account: { ...account, __typename: 'Account', seasonStats: { all: stats }, awards: [], championships: [], cardStats: [{ __typename: 'AccountCardStatSeason', season: 'all', cells: account.cardStats }] } }] },
        DefaultPositionWeights: { defaultPositionWeights: { ST: { goals: 1 }, GK: { catches: 1 }, DEF: { tackles: 1 }, CM: { passes: 1 } } },
        ImportAccountMatches: { importAccountMatches: rows([]) },
      };
      if (Object.hasOwn(graph, operation)) return route.fulfill({ json: { data: graph[operation] } });
    } else if (request.method() === 'GET') {
      if (path === '/api/media/accounts/fixture-player/pending-image') return route.fulfill({ body: placeholder, contentType: 'image/svg+xml' });
      const rest: Record<string, unknown> = {
        '/api/accounts/me': card,
        '/api/settings/current_season': 'S1',
        '/api/settings/position_weights': pageOf([{ index: 0, key: null, value: null }]),
        '/api/settings/season_champions': fields({}),
        '/api/integrations/discord': { configured: true },
        '/api/roles': rows([{ userId: card.id, username: card.username, role: 'super_admin' }]),
        '/api/position-requests': rows([positionRequest]),
        '/api/accounts': rows(url.searchParams.has('pendingImage') ? [{ ...summaryForRest(card), pendingImageUrl: '/api/media/accounts/fixture-player/pending-image' }] : [summaryForRest(card), ...candidateCards()]),
        '/api/transfers': rows([transfer]),
        '/api/rules': rows([rule]),
        '/api/rules/fixture-rule': { ...rule, body: 'Respect other players. Play fairly and report match results accurately.' },
        '/api/articles': rows([article]),
        '/api/articles/slug/league-update': { ...article, body: 'Welcome to a new season of ASL.', excerpt: 'The season begins.' },
        '/api/articles/fixture-article/body': pageOf(['Welcome to a new season of ASL.']),
        '/api/articles/fixture-article/excerpt': pageOf(['The season begins.']),
        '/api/schedule': { ...rows([scheduledMatch]), weekRange: { min: 1, max: 1, count: 1 } },
        '/api/schedule/fixture-match/notes': pageOf(['Watch the match live.']),
        '/api/teams/fixture-team': { ...fullTeam, memberCount: 2, descriptionUrl: '/api/teams/fixture-team/description', editorUrl: '/api/teams/fixture-team/editor', lineupUrl: '/api/teams/fixture-team/lineup' },
        '/api/teams/fixture-team/description': pageOf([fullTeam.description]),
        '/api/teams/fixture-team/editor': fields(fullTeam),
        '/api/teams/fixture-team/lineup': fields({}),
        '/api/teams/fixture-team/members': rows([card.username]),
        '/api/teams/fixture-team/invitations': rows([]),
        '/api/teams/fixture-team/seasons': rows(['S1']),
        '/api/voting/periods': rows(fixture.votingOpen ? [{ ...period, eligiblePlayerCount: 4, winnerCount: 0 }] : []),
        '/api/voting/periods/fixture-vote/tally': { totalVotes: 1, positions: { GK: [['Candidate GK', 1]], DEF: [['Candidate DEF', 1]], CM: [['Candidate CM', 1]], ST: [['Candidate ST', 1]] } },
        '/api/voting/periods/fixture-vote/votes': rows([]),
        '/api/voting/periods/fixture-vote/votes/me': fixture.votes,
        '/api/accounts/fixture-player/stats': fields(stats),
        '/api/accounts/fixture-player/matches/played-match': fields(playedMatch),
        '/api/accounts/fixture-player/awards/fixture-award': fields(playerAward),
        '/api/accounts/fixture-player/championships/fixture-championship': fields(championship),
        '/api/position-requests/fixture-position/reason': pageOf(['More experience playing midfield.']),
      };
      if (Object.hasOwn(rest, path)) return route.fulfill({ json: rest[path] });
      if (/^\/api\/news\/fixture-(?:announcement|matchup|result)\/(?:body|notes)$/.test(path)) return route.fulfill({ json: pageOf(['Synthetic league news for browser validation.']) });
    } else {
      if (operation === '/api/voting/periods/fixture-vote/votes/me' && request.method() === 'PUT') {
        fixture.votes = Object.entries(body ?? {}).map(([position, votedForUsername]) => ({ voterUsername: card.username, position: position.toUpperCase(), votedForUsername: String(votedForUsername) }));
      }
      return route.fulfill({ status: 204 });
    }
    fixture.unexpected.push(`${request.method()} ${operation}`);
    return route.fulfill({ status: 500, json: { error: 'missing_fixture', message: `Missing browser fixture for ${operation}` } });
  });
  return fixture;
}

function summaryForRest(card: ReturnType<typeof currentCard>) {
  return { ...card, seasonStats: { all: stats }, awards: [], championships: [] };
}
