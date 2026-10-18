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
  tierName = tierName.toUpperCase();
  if (tierName === 'DIAMOND') return {
    name: 'DIAMOND',
    // Richer, more saturated accents so Diamond pops against the Silver gray
    from: '#4fb5e8', to: '#c8e8ff', accent: '#0a2838', text: '#061826', glow: '#ffffff',
    material: {
      // Holographic prismatic diamond — vivid cyan-blue base with magenta/
      // purple refractions baked in via a second gradient layer. This makes
      // it unmistakably "diamond" rather than looking like extra-shiny silver.
      bg: `linear-gradient(135deg,
        #3fa6e0 0%,
        #7fcbed 18%,
        #e4f4fb 42%,
        #ffffff 52%,
        #d4e8ff 65%,
        #a8b8ff 78%,
        #d8a8ff 92%,
        #4fb5e8 100%
      )`,
      texture: `
        /* Prismatic color sheen — subtle rainbow bands cutting across the card */
        linear-gradient(115deg,
          transparent 0%,
          rgba(255,100,220,0.12) 18%,
          transparent 24%,
          rgba(100,220,255,0.18) 42%,
          transparent 50%,
          rgba(200,180,255,0.15) 70%,
          transparent 76%,
          rgba(255,255,255,0.22) 90%,
          transparent 100%
        ),
        /* Bright sparkle specks for the gem feel */
        radial-gradient(circle at 22% 30%, rgba(255,255,255,0.95) 0px, transparent 1.5px),
        radial-gradient(circle at 73% 18%, rgba(255,255,255,0.9) 0px, transparent 1.5px),
        radial-gradient(circle at 45% 65%, rgba(255,255,255,0.95) 0px, transparent 2px),
        radial-gradient(circle at 88% 78%, rgba(180,230,255,0.9) 0px, transparent 1.5px),
        radial-gradient(circle at 15% 85%, rgba(255,255,255,0.85) 0px, transparent 1.5px),
        radial-gradient(circle at 62% 42%, rgba(255,220,255,0.7) 0px, transparent 1.5px)
      `,
      textureOpacity: 1,
    },
  };
  if (tierName === 'GOLD') return {
    name: 'GOLD',
    from: '#b8801a', to: '#ffd84a', accent: '#5a3e08', text: '#3a2a08', glow: '#ffe680',
    material: {
      // Strong unmistakable yellow-gold — saturated, classic FIFA gold
      bg: `linear-gradient(135deg,
        #a87018 0%,
        #d99c2b 22%,
        #f5cc3e 45%,
        #ffe680 60%,
        #f5cc3e 75%,
        #c98818 100%
      )`,
      texture: `repeating-linear-gradient(90deg,
        transparent 0px,
        rgba(255,235,140,0.08) 0.5px,
        transparent 1.5px
      )`,
      textureOpacity: 0.6,
    },
  };
  if (tierName === 'SILVER') return {
    name: 'SILVER',
    from: '#7a8088', to: '#dee2e6', accent: '#2a2e34', text: '#1a1e22', glow: '#f4f6f8',
    material: {
      // Cool steel — clearly silver/gray, no warm tones
      bg: `linear-gradient(135deg,
        #7a8088 0%,
        #b4bac0 22%,
        #e8ecf0 45%,
        #f4f6f8 55%,
        #ccd0d4 75%,
        #8c9298 100%
      )`,
      texture: `repeating-linear-gradient(0deg,
        transparent 0px,
        rgba(255,255,255,0.1) 0.5px,
        transparent 1.5px,
        rgba(0,0,0,0.05) 2px,
        transparent 2.5px
      )`,
      textureOpacity: 0.7,
    },
  };
  return {
    name: 'BRONZE',
    from: '#7a4818', to: '#d18a4a', accent: '#3a1e08', text: '#2a1408', glow: '#e0a05c',
    material: {
      // Strong reddish-orange copper-bronze — unmistakably warm
      bg: `linear-gradient(135deg,
        #6e3c10 0%,
        #a85c20 22%,
        #d18a4a 45%,
        #e0a05c 55%,
        #b8702a 75%,
        #803c10 100%
      )`,
      texture: `repeating-linear-gradient(45deg,
        transparent 0px,
        rgba(0,0,0,0.05) 1px,
        transparent 2px,
        rgba(255,200,150,0.06) 3px,
        transparent 4px
      )`,
      textureOpacity: 0.5,
    },
  };
};
