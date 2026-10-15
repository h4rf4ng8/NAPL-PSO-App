import type { Team } from './models';

// Stored seasons exclude a team from that season's standings.
export function inStandings(team: Pick<Team, 'status' | 'seasons'>, season: string): boolean {
  return team.status === 'approved' && (season === 'all' || !team.seasons?.includes(season));
}
