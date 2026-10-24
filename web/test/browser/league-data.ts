export type FixtureRole = 'visitor' | 'member' | 'captain' | 'admin' | 'super-admin';
export const timestamp = Date.UTC(2026, 9, 20, 18);
export const stats = { games: 12, wins: 8, draws: 2, losses: 2, goals: 24, assists: 9, passes: 80, tackles: 20, deflects: 0, catches: 0, cleanSheets: 2, motm: 3 };
export const ranking = { __typename: 'AccountRanking', score: 82, percentile: 0.73, ranked: true, gamesPlayed: 12, tier: 'GOLD' };
export const team = {
  __typename: 'TeamIdentity', id: 'fixture-team', name: 'Fixture United', tag: 'FXU', color: '#3068b0',
  ownerUsername: 'Fixture Captain', status: 'approved', logoUrl: null, totw: false, totwSetAt: null,
};
export const opponent = { ...team, id: 'fixture-opponent', name: 'Harbor Athletic', tag: 'HBA', color: '#15803d' };
export const pageInfo = { __typename: 'PayloadPageInfo', endCursor: null, hasNextPage: false };
export const pageOf = (nodes: unknown[], type = 'JsonPage') => ({ __typename: type, nodes, pageInfo, totalCount: nodes.length });
export function currentCard(role: FixtureRole) {
  return {
    __typename: 'CurrentAccountCard', id: 'fixture-player', username: role === 'captain' ? 'Fixture Captain' : 'Fixture Player',
    position: 'ST', teamId: team.id, imageUrl: null, pendingImageUrl: null, country: null, email: 'player@example.test',
    roles: role === 'super-admin' ? ['super_admin'] : (role === 'admin' ? ['admin'] : []), stats, ranking, team,
    season: 'all', cardStats: ['GOALS', 'ASSIST', 'PASS/G', 'TKL/G', 'W-L', 'GP'].map((label, index) => ({ __typename: 'CardStatCell', label, value: ['24', '9', '6.7', '1.7', '8-2', '12'][index] })),
    totwUntil: null, cheater: false, strikersId: '12345', steamUrl: null, createdAt: timestamp,
    awardCount: 0, championshipCount: 0, awardPreview: [], championshipPreview: [], previewHasMore: false,
  };
}
export function teamSummary(value = team) {
  return { ...value, __typename: 'TeamSummary', createdAt: timestamp, reviewedAt: timestamp, reviewedBy: 'Fixture Admin', memberCount: 1, invitationCount: 0, seasonCount: 1, viewerInvitation: null };
}
export const fullTeam = {
  ...team, description: 'A synthetic team for browser checks.', members: ['Fixture Player', 'Fixture Captain'], invitations: [],
  pendingMembers: [], seasons: ['S1'], formation: '2-1-2', lineup: {}, createdAt: timestamp,
  reviewedAt: timestamp, reviewedBy: 'Fixture Admin', rejectionReason: null,
};
export const period = { id: 'fixture-vote', season: 'S1', opensAt: timestamp, closesAt: Date.UTC(2027, 0, 1), status: 'open', eligiblePlayers: ['Fixture Player'], createdAt: timestamp };
export function candidateCards() {
  return ['GK', 'DEF', 'CM', 'ST'].map((position, index) => ({
    ...currentCard('member'), __typename: 'AccountCard', id: `candidate-${position.toLowerCase()}`,
    username: `Candidate ${position}`, position, strikersId: String(20_000 + index),
  }));
}
export const transfer = { id: 'fixture-transfer', season: 'S1', playerUsername: 'Fixture Player', fromTeamId: opponent.id, toTeamId: team.id, fromTeam: opponent, toTeam: team, kind: 'transfer', windowType: 'regular', createdAt: timestamp, createdBy: 'Fixture Admin' };
export const positionRequest = { id: 'fixture-position', accountId: 'fixture-player', username: 'Fixture Player', fromPos: 'ST', toPos: 'CM', reasonUrl: '/api/position-requests/fixture-position/reason', status: 'pending', reviewedBy: null, reviewedAt: null, reviewNote: '', createdAt: timestamp };
export const rule = { id: 'fixture-rule', title: 'Fair play', bodyUrl: '/api/rules/fixture-rule', sortOrder: 0, createdAt: timestamp, updatedAt: timestamp };
export const article = { id: 'fixture-article', slug: 'league-update', title: 'League update', coverImageUrl: '', author: 'Fixture Admin', publishedAt: timestamp, updatedAt: timestamp, bodyUrl: '/api/articles/fixture-article/body', excerptUrl: '/api/articles/fixture-article/excerpt' };
export const scheduledMatch = {
  id: 'fixture-match', season: 'S1', week: 1, homeTeamId: team.id, awayTeamId: opponent.id, homeTeam: team, awayTeam: opponent,
  scheduledDate: Date.UTC(2026, 11, 1, 18), streamUrl: '', matchType: 'league', playoffRound: null, status: 'scheduled',
  homeScore: null, awayScore: null, linkedMatchId: null, notesUrl: '/api/schedule/fixture-match/notes', createdAt: timestamp, updatedAt: timestamp,
  homeRecord: { w: 8, d: 2, l: 2 }, awayRecord: { w: 6, d: 3, l: 3 },
};
export function news(kind: string) {
  return { id: `fixture-${kind}`, type: kind, title: kind === 'announcement' ? 'Welcome to the season' : 'Fixture United vs Harbor Athletic',
    pinned: kind === 'announcement', homeTeamId: team.id, awayTeamId: opponent.id, homeTeam: team, awayTeam: opponent,
    homeScore: kind === 'result' ? 3 : null, awayScore: kind === 'result' ? 1 : null, date: timestamp, author: 'Fixture Admin',
    createdAt: timestamp, autoFromSubmission: null, bodyUrl: `/api/news/fixture-${kind}/body`, notesUrl: `/api/news/fixture-${kind}/notes` };
}
