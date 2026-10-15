const paths: Record<string, string> = {
  home: '/', me: '/card', teams: '/teams', leaderboard: '/leaderboard',
  news: '/news', hof: '/hof', standings: '/standings', schedule: '/schedule',
  transfers: '/transfers', tiers: '/tiers', rules: '/rules', admin: '/admin',
  vote: '/vote', matches: '/matches',
};
const views = Object.fromEntries(Object.entries(paths).map(([view, path]) => [path, view]));

export const hashForView = (view: string): string => '#' + (paths[view] ?? '/');
export function viewFromHash(hash: string): string {
  const path = '/' + hash.replace(/^#?\/?/, '').replace(/\/+$/, '');
  const view = views[path];
  if (view) return view;
  return path === '/articles' || path.startsWith('/articles/') ? 'news' : 'home';
}
