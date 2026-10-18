import { useId, type ReactNode } from 'react';
import { POS } from '@napl/contracts/league';
import { AWARD } from '@napl/contracts/accounts';

// ============ AWARDS SYSTEM ============
export const AWARD_TYPES = [
  { id: AWARD.GLOVE, name: 'Golden Glove',     short: 'GG', desc: 'Best Goalkeeper',    pos: POS.GK },
  { id: AWARD.STRIKER, name: 'Golden Boot',      short: 'GB', desc: 'Top Scorer',         pos: POS.ST },
  { id: AWARD.DEFENDER, name: 'Golden Defender',  short: 'GD', desc: 'Best Defender',      pos: POS.DEF },
  { id: AWARD.PLAYMAKER, name: 'Golden Playmaker', short: 'GP', desc: 'Best Playmaker',     pos: POS.CM },
];

export const AWARD_BY_ID = Object.fromEntries(AWARD_TYPES.map(a => [a.id, a]));

const GoldAward = ({ size, children }: { size: number; children: (fill: string) => ReactNode }) => {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fce98a" /><stop offset="40%" stopColor="#f5cc3e" /><stop offset="100%" stopColor="#8a6914" />
        </linearGradient>
      </defs>
      {children(`url(#${gradientId})`)}
    </svg>
  );
};

// Gold SVG icons — premium, not emoji
const GoldGlove = ({ size = 20 }: { size?: number }) => (
  <GoldAward size={size}>{fill => <>
    <path d="M9 6 Q9 3 12 3 L20 3 Q23 3 23 6 L23 14 L25 14 Q27 14 27 16 L27 20 Q27 22 25 22 L23 22 L23 26 Q23 28 21 28 L11 28 Q9 28 9 26 Z" fill={fill} stroke="#5c4710" strokeWidth="0.8" />
    <path d="M12 6 L12 14 M16 6 L16 14 M20 6 L20 14" stroke="#5c4710" strokeWidth="0.6" fill="none" opacity="0.5" />
  </>}</GoldAward>
);

const GoldBoot = ({ size = 20 }: { size?: number }) => (
  <GoldAward size={size}>{fill => <>
    {/* Cleat body: pointed toe on the right, heel curved up on the left,
        low-cut throat opening at the top */}
    <path d="M 28 22
             L 28 24
             Q 28 25.5 26.5 25.5
             L 5 25.5
             Q 3.5 25.5 3.5 24
             L 3.5 21
             Q 3.5 19 6 18.5
             Q 8 18 10 16.5
             Q 11 15 11 13
             Q 11 11.5 12.5 11.5
             L 15 11.5
             Q 16.5 11.5 17 13
             L 17.5 16
             Q 18 17.5 19.5 17.5
             L 25 17.5
             Q 28 17.5 28 20
             Z"
      fill={fill} stroke="#5c4710" strokeWidth="0.7" strokeLinejoin="round" />
    {/* Throat opening (collar) on top of foot */}
    <path d="M 12.5 12.5 Q 14 14 16.5 14 L 18 14"
      fill="none" stroke="#5c4710" strokeWidth="0.6" opacity="0.55" />
    {/* Three lace stripes diagonally across the side */}
    <path d="M 14 17 L 16.5 19" stroke="#5c4710" strokeWidth="0.7" strokeLinecap="round" opacity="0.75" />
    <path d="M 16 17.5 L 18.5 19.5" stroke="#5c4710" strokeWidth="0.7" strokeLinecap="round" opacity="0.75" />
    <path d="M 18 18 L 20.5 20" stroke="#5c4710" strokeWidth="0.7" strokeLinecap="round" opacity="0.75" />
    {/* Studs along the sole */}
    <rect x="6" y="25.5" width="2" height="2" rx="0.3" fill="#5c4710" />
    <rect x="12" y="25.5" width="2" height="2" rx="0.3" fill="#5c4710" />
    <rect x="18" y="25.5" width="2" height="2" rx="0.3" fill="#5c4710" />
    <rect x="24" y="25.5" width="2" height="2" rx="0.3" fill="#5c4710" />
  </>}</GoldAward>
);

const GoldShield = ({ size = 20 }: { size?: number }) => (
  <GoldAward size={size}>{fill => <>
    <path d="M16 3 L26 6 L26 16 Q26 24 16 29 Q6 24 6 16 L6 6 Z" fill={fill} stroke="#5c4710" strokeWidth="0.8" />
    <path d="M16 10 L19 14 L23 14 L20 17 L21 21 L16 19 L11 21 L12 17 L9 14 L13 14 Z" fill="#5c4710" opacity="0.7" />
  </>}</GoldAward>
);

const GoldStar = ({ size = 20 }: { size?: number }) => (
  <GoldAward size={size}>{fill => <>
    {/* Classic 5-point star */}
    <path d="M 16 3 L 19.5 12.2 L 29 12.6 L 21.5 18.6 L 24.2 28 L 16 22.7 L 7.8 28 L 10.5 18.6 L 3 12.6 L 12.5 12.2 Z"
          fill={fill} stroke="#5c4710" strokeWidth="0.8" strokeLinejoin="round" />
    {/* Subtle inner highlight on the upper facets */}
    <path d="M 16 3 L 19.5 12.2 L 16 12 L 12.5 12.2 Z" fill="#fce98a" opacity="0.55" />
  </>}</GoldAward>
);

// Championship trophy cup — used for SEASON WINNERS (gold) and RUNNER-UP (silver).
// `tone` = 'gold' or 'silver'. Each instance generates a unique gradient id so
// multiple trophies on a page don't share state.

export const ChampionTrophy = ({ size = 24, tone = 'gold' }: { size?: number; tone?: string }) => {
  const uid = useId();
  const palette = tone === 'silver'
    ? { light: '#f5f7fa', mid: '#cdd3dc', dark: '#7a8290', stroke: '#4a4e54', shine: '#ffffff' }
    : { light: '#fce98a', mid: '#f5cc3e', dark: '#8a6914', stroke: '#5c4710', shine: '#fff5b8' };
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.light} />
          <stop offset="40%" stopColor={palette.mid} />
          <stop offset="100%" stopColor={palette.dark} />
        </linearGradient>
      </defs>
      {/* Square base — two tiers */}
      <rect x="28" y="108" width="44" height="10" rx="1.5" fill={`url(#${uid})`} stroke={palette.stroke} strokeWidth="0.8" />
      <rect x="32" y="100" width="36" height="10" rx="1" fill={`url(#${uid})`} stroke={palette.stroke} strokeWidth="0.8" />
      {/* Stem */}
      <rect x="44" y="86" width="12" height="16" fill={`url(#${uid})`} stroke={palette.stroke} strokeWidth="0.8" />
      {/* Stem flare into cup */}
      <path d="M 38 86 L 62 86 L 58 78 L 42 78 Z" fill={`url(#${uid})`} stroke={palette.stroke} strokeWidth="0.8" />
      {/* Cup body */}
      <path d="M 28 22 L 72 22 L 72 40 Q 72 70 50 78 Q 28 70 28 40 Z" fill={`url(#${uid})`} stroke={palette.stroke} strokeWidth="1" />
      {/* Cup rim */}
      <rect x="25" y="18" width="50" height="6" rx="1" fill={`url(#${uid})`} stroke={palette.stroke} strokeWidth="0.8" />
      {/* Left handle */}
      <path d="M 28 28 Q 12 28 12 42 Q 12 56 28 56" fill="none" stroke={`url(#${uid})`} strokeWidth="5" strokeLinecap="round" />
      <path d="M 28 28 Q 12 28 12 42 Q 12 56 28 56" fill="none" stroke={palette.stroke} strokeWidth="0.8" />
      {/* Right handle */}
      <path d="M 72 28 Q 88 28 88 42 Q 88 56 72 56" fill="none" stroke={`url(#${uid})`} strokeWidth="5" strokeLinecap="round" />
      <path d="M 72 28 Q 88 28 88 42 Q 88 56 72 56" fill="none" stroke={palette.stroke} strokeWidth="0.8" />
      {/* Cup highlight */}
      <ellipse cx="42" cy="35" rx="6" ry="14" fill={palette.shine} opacity="0.45" />
    </svg>
  );
};

export const AwardIcon = ({ awardId, size = 20 }: { awardId: string; size?: number }) => {
  if (awardId === AWARD.GLOVE) return <GoldGlove size={size} />;
  if (awardId === AWARD.STRIKER) return <GoldBoot size={size} />;
  if (awardId === AWARD.DEFENDER) return <GoldShield size={size} />;
  return awardId === AWARD.PLAYMAKER ? <GoldStar size={size} /> : null;
};

// A tiny reusable star badge for anywhere a captain's name appears in HTML/JSX
// (as opposed to the SVG card which draws it inline). Black star, thin white
// outline via text-shadow so it's visible on any bg.
export const CaptainStar = ({ size = 12, title = 'Team Captain' }: { size?: number; title?: string }) => (
  <span
    title={title}
    aria-label={title}
    style={{
      display: 'inline-block',
      color: '#000',
      fontSize: size,
      lineHeight: 1,
      textShadow: '0 0 2px #fff, 0 0 1px #fff, 1px 1px 0 rgba(255,255,255,0.6), -1px -1px 0 rgba(255,255,255,0.6)',
      marginRight: 2,
    }}
  >★</span>
);
