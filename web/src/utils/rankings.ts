import type { Account, Stats } from '../api/models';

const emptyStats = (): Stats => ({
  games: 0, goals: 0, assists: 0, tackles: 0,
  passes: 0, cleanSheets: 0, deflects: 0, catches: 0,
  motm: 0, wins: 0, losses: 0, draws: 0,
});

export const getStatsForSeason = (account: Account, season: string): Stats =>
  season === 'all' ? account.stats : account.seasonStats?.[season] ?? emptyStats();

export const getCardStatsForSeason = (account: Account, season: string) =>
  account.cardStats.find(card => card.season === season)?.cells ??
  account.cardStats.find(card => card.season === null)?.cells ?? [];

export const STAT_KEY_LABELS: Record<string, string> = {
  goalsPerGame: 'Goals', assistsPerGame: 'Assists', tacklesPerGame: 'Tackles',
  passesPerGame: 'Passes', deflectsPerGame: 'Deflects', catchesPerGame: 'Catches',
  cleanSheetPct: 'Clean Sheets',
};

export const cardTier = (tierName: string) => {
  switch (tierName.toUpperCase()) {
    case 'DIAMOND': { return {name: 'DIAMOND', from: '#4fb5e8', accent: '#0a2838'};
    }
    case 'GOLD': { return {name: 'GOLD', from: '#b8801a', accent: '#5a3e08'};
    }
    case 'SILVER': { return {name: 'SILVER', from: '#7a8088', accent: '#2a2e34'};
    }
    default: { return {name: 'BRONZE', from: '#7a4818', accent: '#3a1e08'};
    }
  }
};
