import type { Account } from '../accounts/models';
import type { VotingPeriod } from '../voting/models';
export function collectSeasons(players: Account[], current: string): string[] {
  const seasons = new Set([current]);
  for (const player of players) {
    if (player.seasonStats) {
      for (const season of Object.keys(player.seasonStats)) if (season !== 'all') seasons.add(season);
    } else {
      const history = player.matches || [];
      for (const match of history) seasons.add(match.season || 'S1');
    }
  }
  // eslint-disable-next-line unicorn/no-array-sort -- Sort a fresh array while retaining ES2022 browser support.
  return [...seasons].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

export function activePeriod(periods: VotingPeriod[], now = Date.now()): VotingPeriod | null {
  return periods.find(period => period.status === 'open' && period.opensAt <= now && now < period.closesAt) ?? null;
}
