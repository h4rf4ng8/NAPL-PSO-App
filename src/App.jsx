import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trophy, Target, Zap, Shield, Activity, User, LogOut, Plus, TrendingUp,
  Award, Users, ChevronRight, X, Edit3, Crown, CheckCircle, XCircle,
  Clock, Swords, Calendar, Flag, Star, BarChart3, Hand, Footprints, Sparkles,
  Share2, Download, Copy, Check, Home as HomeIcon
} from 'lucide-react';

// ============ ASL THEME (LIGHT) ============
// Note: token names are kept for code stability, but values are now light-theme:
// `cream` = primary text (navy), `navy*` = surface/border tints (white/grey).
const C = {
  navy: '#ffffff',          // primary surface (light theme)
  navyDeep: '#f4f6fb',      // page background
  navyLight: '#dfe4f0',     // subtle border / muted surface
  green: '#2d7a4a',         // status green (positive)
  greenLight: '#3fa05f',
  red: '#a8243a',           // status red (negative)
  redLight: '#c93852',
  // PRIMARY TEXT — ASL brand blue on light backgrounds
  cream: '#1c4788',         // was '#1a2752' — now ASL blue
  // ASL gold accent (from brand kit)
  gold: '#a8892e',          // gold on light bg (contrast-safe)
  goldLight: '#c0a038',     // ASL gold from brand kit
  white: '#ffffff',
  black: '#000000',
  // Brand color surfaces — real ASL blues for dark accents & brand moments
  brandNavy: '#3068b0',     // ASL primary blue
  brandNavyDeep: '#185090', // ASL deeper blue for gradients / hover
  // Text color to use *on top* of colored/dark backgrounds
  onColor: '#ffffff',
};

// ============ ADMIN CONFIG ============
// ============ ADMIN CONFIG ============
// "Super admins" are hardcoded as a safety net — they can never be removed
// via the UI. They have the unique power to promote/demote other admins.
const SUPER_ADMIN_USERNAMES = ['harfang', 'harfang1906'];
// Regular admins are stored in the DB and managed via the Admin Panel.
// Both super admins and regular admins have full admin powers EXCEPT
// only super admins can manage the admin list itself.

// ============ STORAGE ============
// ============ SUPABASE DATA LAYER ============
// All persistent data goes through Supabase (cloud database).
// See src/lib/supabase.js for the implementation.
import { db, auth, supabase } from './lib/supabase';


const isSuperAdmin = (account) => account && SUPER_ADMIN_USERNAMES.includes(account.username.toLowerCase());
const isAdmin = (account, dynamicAdmins = []) => {
  if (!account) return false;
  const u = account.username.toLowerCase();
  if (SUPER_ADMIN_USERNAMES.includes(u)) return true;
  return dynamicAdmins.some(a => a.toLowerCase() === u);
};

// ============ USERNAME PROFANITY FILTER ============
// Blocks offensive usernames at registration. To add/remove words, edit the
// lists below. The check normalizes the username first (strips separators,
// numbers, repeated letters, common leetspeak) so simple evasions like
// "f_u_c_k" or "sh1t" are also caught.
//
// BLOCKED_SUBSTRINGS: long, unambiguous words — blocked anywhere in the name.
// BLOCKED_WHOLEWORDS: short words that appear inside innocent words
//   (e.g. "cunt" in "Scunthorpe") — blocked only when they stand alone-ish.
const BLOCKED_SUBSTRINGS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'pussy', 'whore',
  'porn', 'rapist', 'dildo', 'masturbate', 'orgasm',
  'nigger', 'nigga', 'faggot', 'retard', 'wetback',
  'chink', 'kike', 'tranny', 'nazi', 'hitler', 'rapehub',
];
const BLOCKED_WHOLEWORDS = [
  'cunt', 'dick', 'cock', 'piss', 'wank', 'twat', 'prick', 'slut',
  'sex', 'rape', 'cum', 'penis', 'vagina', 'boobs', 'horny',
  'nude', 'nudes', 'fag', 'spic', 'dyke', 'coon', 'gook', 'kkk',
];

// Normalize a string to catch obfuscated profanity
const normalizeForProfanity = (str) => {
  let s = str.toLowerCase();
  const leet = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
  s = s.replace(/[013457 8@$!]/g, (c) => leet[c] || c);
  s = s.replace(/[^a-z]/g, '');
  s = s.replace(/(.)\1{2,}/g, '$1');
  return s;
};

// Returns the offending word if the username is not allowed, else null
const checkUsernameProfanity = (username) => {
  const normalized = normalizeForProfanity(username);
  const collapsed = normalized.replace(/(.)\1+/g, '$1');

  // Long unambiguous words: block anywhere
  for (const word of BLOCKED_SUBSTRINGS) {
    if (normalized.includes(word) || collapsed.includes(word)) return word;
  }
  // Short words: block only when surrounded by non-letters or string ends
  // (so "cunt" blocks "x_cunt_x" but not "Scunthorpe")
  for (const word of BLOCKED_WHOLEWORDS) {
    const re = new RegExp(`(^|[^a-z])${word}([^a-z]|$)`);
    // test against the ORIGINAL lowercased name (keeps separators as boundaries)
    if (re.test(username.toLowerCase())) return word;
    // also catch it as the entire normalized string (e.g. "sex" alone)
    if (normalized === word || collapsed === word) return word;
  }
  return null;
};

// ============ COUNTRIES ============
// Players pick a country at registration; the flag shows on their card.
// COUNTRY_CODES maps the country name to its ISO code, used to load a real
// flag image from flagcdn.com (e.g. https://flagcdn.com/w80/ca.png).
const COUNTRIES = [
  'Canada', 'United States', 'Mexico', 'El Salvador', 'United Kingdom', 'Ireland', 'France',
  'Germany', 'Spain', 'Portugal', 'Italy', 'Netherlands', 'Belgium',
  'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Poland', 'Albania', 'Bosnia and Herzegovina',
  'Brazil', 'Argentina', 'Colombia', 'Chile', 'Australia', 'New Zealand', 'Japan',
  'South Korea', 'China', 'Russia', 'Nigeria', 'South Africa', 'India', 'Other',
];
const COUNTRY_CODES = {
  'Canada': 'ca', 'United States': 'us', 'Mexico': 'mx', 'El Salvador': 'sv',
  'United Kingdom': 'gb', 'Ireland': 'ie', 'France': 'fr',
  'Germany': 'de', 'Spain': 'es', 'Portugal': 'pt', 'Italy': 'it',
  'Netherlands': 'nl', 'Belgium': 'be', 'Switzerland': 'ch',
  'Sweden': 'se', 'Norway': 'no', 'Denmark': 'dk', 'Poland': 'pl',
  'Albania': 'al', 'Bosnia and Herzegovina': 'ba',
  'Brazil': 'br', 'Argentina': 'ar', 'Colombia': 'co', 'Chile': 'cl',
  'Australia': 'au', 'New Zealand': 'nz', 'Japan': 'jp',
  'South Korea': 'kr', 'China': 'cn', 'Russia': 'ru', 'Nigeria': 'ng', 'South Africa': 'za',
  'India': 'in',
};
// Returns a flag image URL for a country, or null (e.g. for "Other")
const flagUrl = (country) => {
  const code = COUNTRY_CODES[country];
  return code ? `https://flagcdn.com/w80/${code}.png` : null;
};

// ============ AWARDS SYSTEM ============
const AWARD_TYPES = [
  { id: 'glove',     name: 'Golden Glove',     short: 'GG', desc: 'Best Goalkeeper',    pos: 'GK' },
  { id: 'striker',   name: 'Golden Striker',   short: 'GS', desc: 'Top Scorer',         pos: 'ST' },
  { id: 'defender',  name: 'Golden Defender',  short: 'GD', desc: 'Best Defender',      pos: 'DEF' },
  { id: 'playmaker', name: 'Golden Playmaker', short: 'GP', desc: 'Best Playmaker',     pos: 'CM' },
];
const AWARD_BY_ID = Object.fromEntries(AWARD_TYPES.map(a => [a.id, a]));

// Gold SVG icons — premium, not emoji
const GoldGlove = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="ggrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fce98a" /><stop offset="40%" stopColor="#f5cc3e" /><stop offset="100%" stopColor="#8a6914" />
      </linearGradient>
    </defs>
    <path d="M9 6 Q9 3 12 3 L20 3 Q23 3 23 6 L23 14 L25 14 Q27 14 27 16 L27 20 Q27 22 25 22 L23 22 L23 26 Q23 28 21 28 L11 28 Q9 28 9 26 Z" fill="url(#ggrad)" stroke="#5c4710" strokeWidth="0.8" />
    <path d="M12 6 L12 14 M16 6 L16 14 M20 6 L20 14" stroke="#5c4710" strokeWidth="0.6" fill="none" opacity="0.5" />
  </svg>
);

const GoldBoot = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="bgrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fce98a" /><stop offset="40%" stopColor="#f5cc3e" /><stop offset="100%" stopColor="#8a6914" />
      </linearGradient>
    </defs>
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
      fill="url(#bgrad)" stroke="#5c4710" strokeWidth="0.7" strokeLinejoin="round" />
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
  </svg>
);

const GoldShield = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="sgrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fce98a" /><stop offset="40%" stopColor="#f5cc3e" /><stop offset="100%" stopColor="#8a6914" />
      </linearGradient>
    </defs>
    <path d="M16 3 L26 6 L26 16 Q26 24 16 29 Q6 24 6 16 L6 6 Z" fill="url(#sgrad)" stroke="#5c4710" strokeWidth="0.8" />
    <path d="M16 10 L19 14 L23 14 L20 17 L21 21 L16 19 L11 21 L12 17 L9 14 L13 14 Z" fill="#5c4710" opacity="0.7" />
  </svg>
);

const GoldStar = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
    <defs>
      <linearGradient id="stargrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fce98a" /><stop offset="40%" stopColor="#f5cc3e" /><stop offset="100%" stopColor="#8a6914" />
      </linearGradient>
    </defs>
    {/* Classic 5-point star */}
    <path d="M 16 3 L 19.5 12.2 L 29 12.6 L 21.5 18.6 L 24.2 28 L 16 22.7 L 7.8 28 L 10.5 18.6 L 3 12.6 L 12.5 12.2 Z"
          fill="url(#stargrad)" stroke="#5c4710" strokeWidth="0.8" strokeLinejoin="round" />
    {/* Subtle inner highlight on the upper facets */}
    <path d="M 16 3 L 19.5 12.2 L 16 12 L 12.5 12.2 Z" fill="#fce98a" opacity="0.55" />
  </svg>
);

// Championship trophy cup — used for SEASON WINNERS (gold) and RUNNER-UP (silver).
// `tone` = 'gold' or 'silver'. Each instance generates a unique gradient id so
// multiple trophies on a page don't share state.
let __trophyIdCounter = 0;
const ChampionTrophy = ({ size = 24, tone = 'gold' }) => {
  const uid = useMemo(() => `trophy-${tone}-${++__trophyIdCounter}`, [tone]);
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

const AwardIcon = ({ awardId, size = 20 }) => {
  if (awardId === 'glove')     return <GoldGlove size={size} />;
  if (awardId === 'striker')   return <GoldBoot size={size} />;
  if (awardId === 'defender')  return <GoldShield size={size} />;
  if (awardId === 'playmaker') return <GoldStar size={size} />;
  return null;
};

// Returns array of awards a player has won. Each award = {awardId, season, assignedBy, assignedAt}
const getPlayerAwards = (account) => account?.awards || [];
const hasAnyAward = (account) => (account?.awards?.length || 0) > 0;

// ============ STAT CALCS ============
const POSITIONS = ['ST', 'CM', 'DEF', 'GK', 'FLEX'];

const emptyStats = () => ({
  games: 0, goals: 0, assists: 0, tackles: 0,
  passes: 0, cleanSheets: 0, deflects: 0, catches: 0,
  motm: 0, wins: 0, losses: 0, draws: 0,
});

const getStatsForSeason = (account, season) => {
  if (season === 'all' || !account.matches) return account.stats || emptyStats();
  const matches = (account.matches || []).filter(m => (m.season || 'S1') === season);
  if (matches.length === 0) return emptyStats();
  const s = emptyStats();
  let totalPasses = 0;
  for (const m of matches) {
    s.games += 1;
    s.goals += m.goals || 0;
    s.assists += m.assists || 0;
    s.tackles += m.tackles || 0;
    s.deflects += m.deflects || 0;
    s.catches += m.catches || 0;
    if (m.cleanSheet) s.cleanSheets += 1;
    if (m.motm) s.motm += 1;
    if (m.result === 'W') s.wins += 1;
    else if (m.result === 'L') s.losses += 1;
    else s.draws += 1;
    totalPasses += m.passes || 0;
  }
  s.passes = Math.round(totalPasses / s.games);
  return s;
};

const calcAttributes = (stats, position) => {
  const games = Math.max(stats.games || 0, 1);
  const goals = stats.goals || 0;
  const assists = stats.assists || 0;
  const tackles = stats.tackles || 0;
  const passes = stats.passes || 0;
  const cleanSheets = stats.cleanSheets || 0;
  const deflects = stats.deflects || 0;
  const catches = stats.catches || 0;
  const motm = stats.motm || 0;

  const clamp = (n) => Math.min(99, Math.max(40, Math.round(n)));

  // Rewritten to use only Strikers-Club-tracked stats. Numeric weights are
  // starting values — super admins can dial them via ADMIN → WEIGHTINGS.
  const pace = clamp(55 + (assists / games) * 12 + (motm / games) * 10 + (['ST','DEF'].includes(position) ? 8 : 0));
  const shooting = clamp(50 + (goals / games) * 25 + (position === 'ST' ? 12 : 0));
  const passing = clamp(50 + (assists / games) * 15 + Math.min(passes / games, 50) * 0.5 + (position === 'CM' ? 10 : 0));
  const dribbling = clamp(55 + ((goals + assists) / games) * 10 + (motm / games) * 8 + (['ST','CM'].includes(position) ? 8 : 0));
  const defending = clamp(45 + (tackles / games) * 10 + (cleanSheets / games) * 20 + (position === 'DEF' ? 14 : 0));
  const physical = clamp(60 + (tackles / games) * 5 + (motm / games) * 8 + (['DEF','ST'].includes(position) ? 6 : 0));

  if (position === 'GK') {
    const gkRating = clamp(55 + (cleanSheets / games) * 25 + (deflects / games) * 4 + (catches / games) * 3 + (motm / games) * 10);
    return {
      pace: clamp(50 + (deflects / games) * 2),
      shooting: clamp(40 + (cleanSheets / games) * 10),
      passing: clamp(50 + Math.min(passes / games, 40) * 0.5),
      dribbling: clamp(45 + (deflects / games) * 1.5),
      defending: gkRating,
      physical: clamp(60 + (deflects / games) * 3 + (catches / games) * 2),
    };
  }
  return { pace, shooting, passing, dribbling, defending, physical };
};

const calcOverall = (attrs, position) => {
  // Legacy single-player formula — kept as fallback for previews/demos
  // where a full player pool isn't available. Real ranking happens in calcRankings().
  const w = {
    ST:  { shooting: .35, pace: .2, dribbling: .2, physical: .15, passing: .05, defending: .05 },
    CM:  { passing: .3, dribbling: .2, physical: .15, defending: .15, shooting: .15, pace: .05 },
    DEF: { defending: .4, physical: .25, pace: .15, passing: .12, dribbling: .04, shooting: .04 },
    GK:  { defending: .5, physical: .2, passing: .15, pace: .05, dribbling: .05, shooting: .05 },
  };
  const weights = w[position] || w.CM;
  let total = 0;
  for (const k in weights) total += attrs[k] * weights[k];
  return Math.round(total);
};

// ============ POSITION-RELATIVE RANKING SYSTEM ============
// Each player's tier is determined by how their per-game stats rank against
// other players AT THE SAME POSITION. Different stats matter for different positions.

const MIN_GAMES_FOR_RANKING = 3;

// Per-position stat weights (must sum to 1.0 each). These are the DEFAULTS —
// super admins can override them via ADMIN → WEIGHTINGS, stored in the DB.
// Only Strikers-Club-tracked stats — no shot%, interceptions, or pass accuracy.
const DEFAULT_POSITION_WEIGHTS = {
  ST:   { goalsPerGame: 0.55, assistsPerGame: 0.20, passesPerGame: 0.10, tacklesPerGame: 0.15 },
  CM:   { assistsPerGame: 0.35, passesPerGame: 0.30, goalsPerGame: 0.15, tacklesPerGame: 0.20 },
  DEF:  { tacklesPerGame: 0.55, assistsPerGame: 0.15, passesPerGame: 0.20, goalsPerGame: 0.10 },
  GK:   { deflectsPerGame: 0.35, cleanSheetPct: 0.35, catchesPerGame: 0.30 },
  // FLEX: equal blend of attack and defense for players who play multiple roles
  FLEX: { goalsPerGame: 0.25, assistsPerGame: 0.25, tacklesPerGame: 0.30, passesPerGame: 0.20 },
};

// Human-readable labels for each stat key (used in the weightings editor UI)
const STAT_KEY_LABELS = {
  goalsPerGame: 'Goals',
  assistsPerGame: 'Assists',
  tacklesPerGame: 'Tackles',
  passesPerGame: 'Passes',
  deflectsPerGame: 'Deflects',
  catchesPerGame: 'Catches',
  cleanSheetPct: 'Clean Sheets',
};

// Extract per-game stat values from a player's account
const playerStatValues = (account) => {
  const s = account.stats || {};
  const g = Math.max(s.games || 0, 1);
  return {
    goalsPerGame:        (s.goals || 0) / g,
    assistsPerGame:      (s.assists || 0) / g,
    tacklesPerGame:      (s.tackles || 0) / g,
    passesPerGame:       (s.passes || 0) / g,
    deflectsPerGame:        (s.deflects || 0) / g,
    catchesPerGame:      (s.catches || 0) / g,
    cleanSheetPct:       (s.cleanSheets || 0) / g,
  };
};

// Given an array of values, return a function that maps a value to its percentile (0-1)
// Percentile = fraction of players strictly below this value + half of equal players
const makePercentileFn = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return () => 0.5;
  return (v) => {
    let below = 0, equal = 0;
    for (const x of sorted) {
      if (x < v) below++;
      else if (x === v) equal++;
      else break;
    }
    return (below + equal / 2) / n;
  };
};

// Main ranking function: given all players, compute each player's tier-score (0-100)
// Returns a Map keyed by username (lowercase) → { score, percentile, ranked, gamesPlayed }
const calcRankings = (allPlayers, customWeights = null) => {
  const result = new Map();
  // Use custom weights if provided, else the defaults
  const weightsByPos = customWeights || DEFAULT_POSITION_WEIGHTS;
  // Group players by position
  const byPos = { ST: [], CM: [], DEF: [], GK: [] };
  allPlayers.forEach(p => {
    if (byPos[p.position]) byPos[p.position].push(p);
  });

  for (const pos of Object.keys(byPos)) {
    const players = byPos[pos];
    const weights = weightsByPos[pos] || DEFAULT_POSITION_WEIGHTS[pos];
    if (!weights) continue;

    // Only "ranked" players (≥ minimum games) count toward the percentile pool
    const eligible = players.filter(p => (p.stats?.games || 0) >= MIN_GAMES_FOR_RANKING);

    // Build per-stat percentile lookup functions, using only the eligible pool
    const pctFns = {};
    for (const statKey of Object.keys(weights)) {
      const values = eligible.map(p => playerStatValues(p)[statKey]);
      pctFns[statKey] = makePercentileFn(values);
    }

    // Score every player
    for (const p of players) {
      const games = p.stats?.games || 0;
      if (games < MIN_GAMES_FOR_RANKING) {
        result.set(p.username.toLowerCase(), { score: 0, percentile: 0, ranked: false, gamesPlayed: games });
        continue;
      }
      const vals = playerStatValues(p);
      let score = 0;
      for (const [statKey, weight] of Object.entries(weights)) {
        score += pctFns[statKey](vals[statKey]) * weight;
      }
      // score is 0..1 — convert to a 0..100 "overall" number
      const overall = Math.round(score * 100);
      result.set(p.username.toLowerCase(), { score: overall, percentile: score, ranked: true, gamesPlayed: games });
    }
  }
  return result;
};

// Tier from the new percentile-based score
// Top 10% = Diamond, next 20% = Gold, next 30% = Silver, bottom 40% = Bronze
const tierFromPercentile = (percentile) => {
  if (percentile >= 0.90) return 'DIAMOND';
  if (percentile >= 0.70) return 'GOLD';
  if (percentile >= 0.40) return 'SILVER';
  return 'BRONZE';
};

// Look up a player's ranking; falls back to legacy formula if rankings unavailable
const getPlayerRanking = (account, rankings = null) => {
  const games = account.stats?.games || 0;
  if (rankings && rankings.has(account.username.toLowerCase())) {
    return rankings.get(account.username.toLowerCase());
  }
  // Fallback: use legacy calcOverall mapped to a percentile-like value
  const attrs = calcAttributes(account.stats, account.position);
  const legacyOverall = calcOverall(attrs, account.position);
  return {
    score: legacyOverall,
    percentile: Math.max(0, Math.min(1, (legacyOverall - 40) / 60)),
    ranked: games >= MIN_GAMES_FOR_RANKING,
    gamesPlayed: games,
  };
};

const cardTier = (overallOrName) => {
  // Accept either a tier name string ('DIAMOND' / 'GOLD' / 'SILVER' / 'BRONZE')
  // or an overall number (legacy fallback).
  let tierName;
  if (typeof overallOrName === 'string') {
    tierName = overallOrName.toUpperCase();
  } else {
    const overall = overallOrName;
    if (overall >= 85) tierName = 'DIAMOND';
    else if (overall >= 75) tierName = 'GOLD';
    else if (overall >= 65) tierName = 'SILVER';
    else tierName = 'BRONZE';
  }
  if (tierName === 'DIAMOND') return {
    name: 'DIAMOND',
    from: '#a8c8d8', to: '#e8f4fa', accent: '#1a3a4a', text: '#0f2530', glow: '#ffffff',
    material: {
      // Pure icy white-blue diamond — no warm tones at all, prismatic feel
      bg: `linear-gradient(135deg,
        #b8d4e0 0%,
        #e0eef4 25%,
        #ffffff 50%,
        #d8e8f0 75%,
        #a8c8d8 100%
      )`,
      texture: `
        radial-gradient(circle at 22% 30%, rgba(255,255,255,0.95) 0px, transparent 1.5px),
        radial-gradient(circle at 73% 18%, rgba(255,255,255,0.85) 0px, transparent 1px),
        radial-gradient(circle at 45% 65%, rgba(255,255,255,0.9) 0px, transparent 1.5px),
        radial-gradient(circle at 88% 78%, rgba(255,255,255,0.75) 0px, transparent 1px),
        radial-gradient(circle at 15% 85%, rgba(255,255,255,0.8) 0px, transparent 1px)
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

// ============ ASL CREST (the league logo) ============
const ASL_LOGO_SRC = 'data:image/png;base64,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42R/38fiJmP/37JlSzp58mT6008/hQzejIFHw6CPd9lB32lWSSmlO3fupO+++y795z//Sdu0aXNKgHy469juLjrZwZ/dYyNGjHCd/TOSsGfPHpqcnMw+T1B/jlc4a68ZqF+mn0CZfQmvvfZatRLMJ598csJB3QzYTra7SBwcp/tMww7oZ599Nn3vvfdoeXl5iLspHBs+FcoO9vbPEggE6LJly+jUqVNp+/btQwDoRFzL7LvJycmhs2bNovfeey8dMWIEveiii2iPHj1o48aNaVpaWsRSpxP4n2gbKTuvX331VbXuOibt2iSZ805WcCcn4fshAOIBrAfQSE9bEy688EJ8++23YRc7SktL0b59e+zdu9dwT9T2qjr70/x3+/uI9HW9Xi8SEhIsLo4mTZrgr7/+wpdfflmzJiCniDOBLWb36NED//znP3HZZZchKysLgJa4Z3bBnI5lXjw1X8+KouC3337De++9h48//hh79uyxLPwdr0VXtsjYq1cvfP3110hJSbH8eyAQQElJCQoKClBQUICDBw9i//792Lt3L/bt24e9e/fi0KFDOHjwIIqKiuD3R546yr539t1ToyWkqQVkLS3OU0rRvHlzrF27FjExMSHXHLufCSHo378/li1bxuIGBACbAXQBENRNHvRkAtKTja0r0HoP3kUIUQRBEL1eL9auXYsWLVqEjQ246667MG/evBq5YOyg7fTlRnpBiaKI+Ph4ZGVlISEhAQ0aNEBmZiYaN26MrKwsNGzYEBkZGcjKykJaWhoSExMtN3dxcTGaNm2KgoKCWr2QTxZHAgC0b98e48ePx+DBgxETE4PCwkIQQpCdnY3Y2FjXtoanY5mvL7N1t6ioCF988QVeffVVLFmy5LgDPHPwZGVl4Z133kGvXr0QGxvrmJ7qVsXFxThy5AgOHjyIvLw848+9e/fi8OHDOHToEPLy8lBYWIiioiKUlZUd13MvSRJkWcbUqVMxc+ZM17wpQRCwZs0a9OjRg31fMqVUAvAIgAdxkrlkTqY7h52YngCW6dMeQVEUMnPmTEydOjVsMtvy5cvRt29fg6lHc9FH2sza4/EgLS0NycnJyMzMREZGBurVq4e6desiLS0NDRo0QEpKCrKzs5GamorU1NQQj311N3cwGITP58NDDz2Ehx9++LSxarLPkZycjHvuuQcjR45EfHw8iouLjQYo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';
const ASL_LOGO_DIAMOND = 'data:image/png;base64,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fcOahVnEGjFixM/SO5gCEFP8GhsbS0bx5icLYS6Xi/r160d/+9vfaOPGjVRSUmLVW8zaR3Z2tlX7MK9TSkk7duxopGkwr/mmm25qVEfJyckhr9fbaNzuvffe4z6Hn3Oa7x8/frxVsNu+fbumKAo5HI5JjDHwpKSkdJ/Pt3DixIlywIABChFh37591l5KTVGs5oy/+eabLU7BdKORkZEh7tH897PPPmtZqNltbcuWLfjmm29OGjsQEebMmXNS2MHUTOgNQiWGDx+OH374AevXrw+pnZgsovl68+Sco6amBhs3bsRDDz2EYcOGYdmyZVZ2Yl6Pqqpwu91WyDDDZ9euXdG7d28rXf09AGTwYe6h8corr+D7778HYwzdunXjEyZMkD6fb17nzp2TAGB927Ztye12C3M2GrKpJmefOZsyMjLo4MGDjcrFwRVK00NkZ2eTw+FosirYpUsXOnLkiDVLDh48+JPewZSXNXV9jLGQWdSvXz9at25dI1HrVVdd1WjmBFcvzeqjoihkt9ut+16yZElIxdGsjJaUlITI4oiI7r777kYiYQB07bXXNukZPB5PI88wZ86cU+IZgr+/X79+lkKrrKxMJCUlEWPsVQ5gwPTp08nlcnHGGBYvXoz169c3opwbppM33nijRewEZxbB6NecQQ899JA1E2NjY9GpUycMGzYMEydOxM033wybzYaIiIiQ3os+ny9Ekn4y3iGYYk5PT8e//vUvfPfddxg+fLjlIaSUaNGiBdasWYN3330XQ4YMAee8SUWWuS2R3++37uXgwYNNAsOmftemTZvjAsimPNupziaOByY3btyIF154AYwxxMXF8SlTphARjVUBiPDwcMUcgOXLlx8XoJm/j42NxdVXXw232x0SJsw6RLCLE0JgyJAhGD16NFq1aoXk5GQkJCQ0ORB+vx+1tbUWWCsrK0NERIT13WbY6tOnD0aOHIl33303JJQJIeByuXDnnXdi5syZiImJsQzMfFgsaFujkSNHYuTIkdi+fTvWrVuH9evXY//+/SgrK4PP5wMRwel0onnz5ujSpYv1eo/HY42F+bnBZfJgedvxXHbDB3+81PLXZhPHA5RLly7FrbfearLCDEBABcBNDt7U5jWUowXPPE3TcM011yAtLc1Cw+agBaeTwe8xu502TP+CKVfGGBwOBxwOB+Li4uDz+VBVVYXa2lq4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';
// Legacy alias — many places still reference the old name
const ASLCrest = ({ size = 40 }) => (
  <img
    src={ASL_LOGO_SRC}
    alt="ASL"
    width={size}
    height={size}
    style={{ display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(26, 39, 82, 0.2))' }}
  />
);

const ASLLogoFull = ({ size = 32 }) => (
  <div className="flex items-center gap-3">
    <ASLCrest size={size} />
    <div>
      <div className="font-display text-white tracking-wider leading-none" style={{ fontSize: size * 0.85, color: C.cream }}>ASL</div>
      <div className="font-mono text-[7px] tracking-[0.3em] mt-0.5" style={{ color: C.cream, opacity: 0.6 }}>NORTH AMERICA PREMIER</div>
    </div>
  </div>
);

// ============ FONT/STYLE CSS ============
const fontCSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Russo+One&family=Barlow+Condensed:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
.font-display { font-family: 'Anton', sans-serif; letter-spacing: 0.02em; }
.font-heading { font-family: 'Russo One', sans-serif; letter-spacing: 0.04em; }
.font-body { font-family: 'Barlow Condensed', sans-serif; }
.font-mono { font-family: 'JetBrains Mono', monospace; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes pulse-glow { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.fade-in { animation: fadeIn 0.4s ease-out; }
.shimmer-text { background: linear-gradient(90deg, ${C.cream} 0%, ${C.gold} 50%, ${C.cream} 100%); background-size: 200% 100%; animation: shimmer 3s infinite; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

.gold-border-wrap {
  position: relative;
  border-radius: 22px;
  padding: 10px;
  /* Real gold: warmer, more orange/amber than CoD yellow.
     Based on actual 24k gold photography — cream highlights, rich amber mids, deep bronze shadows. */
  background: linear-gradient(135deg,
    #5a3a08 0%,
    #a87420 8%,
    #d99c2b 18%,
    #f2c04a 28%,
    #fde9a8 38%,
    #f5cc5e 50%,
    #e0a936 62%,
    #b27c1c 75%,
    #6e4810 88%,
    #f2c04a 100%
  );
  box-shadow:
    0 6px 20px rgba(0,0,0,0.35),
    0 2px 4px rgba(0,0,0,0.4),
    inset 0 2px 0 rgba(255,235,180,0.85),
    inset 0 -2px 0 rgba(60,40,5,0.7),
    inset 2px 0 0 rgba(245,210,140,0.5),
    inset -2px 0 0 rgba(100,65,10,0.5);
}
.gold-border-wrap::after {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 16px;
  pointer-events: none;
  background: linear-gradient(135deg,
    rgba(40,25,0,0.45) 0%,
    transparent 22%,
    transparent 78%,
    rgba(255,230,170,0.4) 100%
  );
  z-index: 1;
}

/* Authentic gold text — warmer amber tones */
.gold-text {
  background: linear-gradient(180deg,
    #fde9a8 0%,
    #f5cc5e 25%,
    #d99c2b 50%,
    #a87420 75%,
    #6e4810 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  filter: drop-shadow(0 1px 0 rgba(40,25,0,0.7));
}

/* Diamond text — pale crystalline gradient with prismatic hints (cyan/violet undertones) */
.diamond-text {
  background: linear-gradient(135deg,
    #ffffff 0%,
    #e6f4f8 18%,
    #ffffff 32%,
    #f0e8ff 48%,
    #ffffff 62%,
    #e0f0f4 78%,
    #ffffff 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  filter:
    drop-shadow(0 0 1px rgba(180,200,220,0.9))
    drop-shadow(0 1px 0 rgba(80,100,120,0.5));
}

/* Diamond badge — small crystalline gem with faceted gradient + prismatic edge hints */
.diamond-badge {
  position: relative;
  display: inline-block;
  padding: 3px 10px;
  /* Faceted body: multi-stop gradient mimicking light hitting cut crystal */
  background:
    linear-gradient(135deg,
      rgba(255,255,255,0.95) 0%,
      rgba(220,235,245,0.6) 20%,
      rgba(255,255,255,0.9) 38%,
      rgba(200,225,240,0.5) 55%,
      rgba(255,255,255,0.85) 72%,
      rgba(225,210,240,0.55) 88%,
      rgba(255,255,255,0.9) 100%
    );
  /* Faceted shape — angled corners suggest cut diamond */
  clip-path: polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%);
  /* Subtle prismatic outline using multiple shadow layers */
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.95),
    inset 0 -1px 0 rgba(120,140,160,0.4),
    inset 1px 0 0 rgba(200,215,255,0.5),
    inset -1px 0 0 rgba(220,200,240,0.5);
  text-shadow: 0 1px 0 rgba(255,255,255,0.6);
}
.diamond-badge::before {
  /* tiny sparkle highlight in upper-left */
  content: '';
  position: absolute;
  top: 1px; left: 6px;
  width: 30%; height: 30%;
  background: radial-gradient(circle, rgba(255,255,255,1) 0%, transparent 70%);
  pointer-events: none;
}
.diamond-badge::after {
  /* tiny sparkle highlight in lower-right */
  content: '';
  position: absolute;
  bottom: 1px; right: 8px;
  width: 18%; height: 30%;
  background: radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%);
  pointer-events: none;
}

/* Gold badge — faceted gem in saturated yellow-gold */
.gold-badge {
  position: relative;
  display: inline-block;
  padding: 3px 10px;
  background:
    linear-gradient(135deg,
      #c98818 0%,
      #f5cc3e 20%,
      #ffe680 38%,
      #d99c2b 55%,
      #ffd84a 72%,
      #b8801a 88%,
      #ffe680 100%
    );
  clip-path: polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%);
  box-shadow:
    inset 0 1px 0 rgba(255,245,200,0.9),
    inset 0 -1px 0 rgba(80,55,5,0.6),
    inset 1px 0 0 rgba(255,235,140,0.5),
    inset -1px 0 0 rgba(120,80,10,0.4);
  text-shadow: 0 1px 0 rgba(255,235,160,0.6);
}
.gold-badge::before {
  content: '';
  position: absolute;
  top: 1px; left: 6px;
  width: 30%; height: 30%;
  background: radial-gradient(circle, rgba(255,250,200,0.95) 0%, transparent 70%);
  pointer-events: none;
}
.gold-badge::after {
  content: '';
  position: absolute;
  bottom: 1px; right: 8px;
  width: 18%; height: 30%;
  background: radial-gradient(circle, rgba(255,235,140,0.6) 0%, transparent 70%);
  pointer-events: none;
}

/* Silver badge — faceted polished steel gem */
.silver-badge {
  position: relative;
  display: inline-block;
  padding: 3px 10px;
  background:
    linear-gradient(135deg,
      #8c9298 0%,
      #ccd0d4 20%,
      #f4f6f8 38%,
      #b4bac0 55%,
      #e8ecf0 72%,
      #7a8088 88%,
      #f4f6f8 100%
    );
  clip-path: polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.95),
    inset 0 -1px 0 rgba(40,45,50,0.5),
    inset 1px 0 0 rgba(220,225,230,0.5),
    inset -1px 0 0 rgba(80,85,90,0.4);
  text-shadow: 0 1px 0 rgba(255,255,255,0.6);
}
.silver-badge::before {
  content: '';
  position: absolute;
  top: 1px; left: 6px;
  width: 30%; height: 30%;
  background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, transparent 70%);
  pointer-events: none;
}
.silver-badge::after {
  content: '';
  position: absolute;
  bottom: 1px; right: 8px;
  width: 18%; height: 30%;
  background: radial-gradient(circle, rgba(220,225,230,0.6) 0%, transparent 70%);
  pointer-events: none;
}

/* Bronze badge — faceted aged copper-bronze gem */
.bronze-badge {
  position: relative;
  display: inline-block;
  padding: 3px 10px;
  background:
    linear-gradient(135deg,
      #6e3c10 0%,
      #b8702a 20%,
      #e0a05c 38%,
      #a85c20 55%,
      #d18a4a 72%,
      #5a2c08 88%,
      #e0a05c 100%
    );
  clip-path: polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%);
  box-shadow:
    inset 0 1px 0 rgba(240,180,130,0.7),
    inset 0 -1px 0 rgba(40,20,5,0.6),
    inset 1px 0 0 rgba(220,160,110,0.4),
    inset -1px 0 0 rgba(60,30,5,0.4);
  text-shadow: 0 1px 0 rgba(220,160,110,0.5);
}
.bronze-badge::before {
  content: '';
  position: absolute;
  top: 1px; left: 6px;
  width: 30%; height: 30%;
  background: radial-gradient(circle, rgba(255,210,160,0.85) 0%, transparent 70%);
  pointer-events: none;
}
.bronze-badge::after {
  content: '';
  position: absolute;
  bottom: 1px; right: 8px;
  width: 18%; height: 30%;
  background: radial-gradient(circle, rgba(220,150,90,0.5) 0%, transparent 70%);
  pointer-events: none;
}
.pitch-bg {
  background:
    radial-gradient(ellipse at top, ${C.brandNavy}0c 0%, transparent 60%),
    radial-gradient(ellipse at bottom, ${C.green}0d 0%, transparent 60%),
    linear-gradient(180deg, #ffffff 0%, ${C.navyDeep} 100%);
}
.pitch-lines {
  background-image:
    linear-gradient(90deg, transparent 49.7%, ${C.brandNavy}08 49.85%, ${C.brandNavy}10 50.15%, transparent 50.3%),
    linear-gradient(0deg, transparent 49.7%, ${C.brandNavy}08 49.85%, ${C.brandNavy}10 50.15%, transparent 50.3%);
}
.crest-shape {
  clip-path: polygon(50% 0%, 100% 8%, 100% 75%, 50% 100%, 0% 75%, 0% 8%);
}
input[type=number]::-webkit-inner-spin-button { opacity: 1; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: ${C.navyDeep}; }
::-webkit-scrollbar-thumb { background: ${C.navyLight}; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: ${C.green}; }

/* Flippable card */
.flip-card {
  perspective: 1400px;
  cursor: pointer;
}
.flip-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
  transform-style: preserve-3d;
}
.flip-card.flipped .flip-card-inner {
  transform: rotateY(180deg);
}
.flip-card-face {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}
.flip-card-back {
  transform: rotateY(180deg);
}
`;

// ============ PLAYER CARD (FIFA STYLE) ============
// ============ CAPTAIN STAR ============
// Small helper: returns true if the given account is the captain (owner) of
// the given APPROVED team. Used by PlayerCard, roster views, standings, etc.
const isTeamCaptain = (account, team) =>
  !!(account && team && team.status === 'approved' &&
    team.ownerUsername && account.username &&
    team.ownerUsername.toLowerCase() === account.username.toLowerCase());

// A tiny reusable star badge for anywhere a captain's name appears in HTML/JSX
// (as opposed to the SVG card which draws it inline). Black star, thin white
// outline via text-shadow so it's visible on any bg.
const CaptainStar = ({ size = 12, title = 'Team Captain' }) => (
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

const PlayerCard = React.forwardRef(({ account, size = 'md', team = null, hideTeam = false, forceOverall = null, forceTier = null, rankings = null }, ref) => {
  // New ranking-based system: look up the player's position-relative score.
  // If rankings unavailable or forced values passed, fall back gracefully.
  const ranking = getPlayerRanking(account, rankings);
  let overall, tierName;
  if (forceTier) {
    tierName = forceTier;
    overall = forceOverall != null ? forceOverall : ranking.score;
  } else if (forceOverall != null) {
    overall = forceOverall;
    tierName = (overall >= 85) ? 'DIAMOND' : (overall >= 75) ? 'GOLD' : (overall >= 65) ? 'SILVER' : 'BRONZE';
  } else {
    overall = ranking.score;
    tierName = ranking.ranked ? tierFromPercentile(ranking.percentile) : 'BRONZE';
  }
  const tier = cardTier(tierName);
  const isUnranked = !ranking.ranked && !forceTier && forceOverall == null;
  const dims = size === 'lg'
    ? { w: 320, h: 510, fontScale: 1 }
    : size === 'sm'
    ? { w: 175, h: 280, fontScale: 0.55 }
    : { w: 240, h: 384, fontScale: 0.75 };

  const games = account.stats?.games || 0;
  const awards = getPlayerAwards(account);
  const hasAwards = awards.length > 0;
  const canFlip = size === 'lg'; // only the large card flips
  const [flipped, setFlipped] = useState(false);

  // Until a player has played MIN_GAMES_FOR_RANKING games, the card shows 0
  // for the overall and every stat — they haven't "earned" a rating yet.
  // forceOverall/forceTier (Tier Preview, etc.) bypass this.
  const showZeroStats = isUnranked;
  const displayOverall = showZeroStats ? 0 : overall;
  const emptyDisplayStats = {
    goals: 0, assists: 0, passes: 0, tackles: 0,
    deflects: 0, catches: 0, cleanSheets: 0, games,
  };
  const displayStats = showZeroStats ? emptyDisplayStats : (account.stats || emptyDisplayStats);

  // v33 palette — metallic body with light/mid/dark/shadow stops for the
  // brushed-metal gradient, plus a separate panel palette for the stats area
  // and awardText (used when an award winner gets a black name label).
  const palette = (() => {
    if (tier.name === 'DIAMOND') return {
      lightest: '#f5fafc', light: '#dceaf2', mid: '#a8c8db', dark: '#5a8aa8', shadow: '#2c4e68',
      panelLight: '#dceaf2', panelMid: '#b8d0e0', panelDark: '#7c9eb8',
      text: '#0e1e2e', awardText: '#bfd9e8',
      stroke: '#2c4e68',
    };
    if (tier.name === 'GOLD') return {
      lightest: '#fff5cc', light: '#fde583', mid: '#ecbd35', dark: '#a87a18', shadow: '#5a3e08',
      panelLight: '#fae27a', panelMid: '#ecbd35', panelDark: '#a87a18',
      text: '#1a1004', awardText: '#f5cc3e',
      stroke: '#5a3e08',
    };
    if (tier.name === 'SILVER') return {
      lightest: '#fafbfc', light: '#dde2e8', mid: '#b8bdc4', dark: '#7a8088', shadow: '#3a3e44',
      panelLight: '#dde2e8', panelMid: '#b8bdc4', panelDark: '#7a8088',
      text: '#0e1014', awardText: '#dfe4e8',
      stroke: '#3a3e44',
    };
    return {
      lightest: '#f0d4a8', light: '#d49058', mid: '#a85a20', dark: '#6e3c10', shadow: '#3a1e08',
      panelLight: '#d49058', panelMid: '#a85a20', panelDark: '#6e3c10',
      text: '#0a0604', awardText: '#d99c5c',
      stroke: '#3a1e08',
    };
  })();

  const VB_W = 320, VB_H = 510; // Internal SVG viewBox so coordinates stay consistent

  // v33 coat-of-arms card outline. Curved shoulders at top, slight inward
  // curve at the sides, pointed bottom.
  const cardPath = "M 22 4 L 298 4 Q 316 4 316 22 L 316 360 Q 316 380 308 396 Q 280 460 160 506 Q 40 460 12 396 Q 4 380 4 360 L 4 22 Q 4 4 22 4 Z";

  // TOTW flag flows from the team to all its members.
  const isTotw = !!(team && team.totw);
  const isCheater = !!account.cheater;
  // Captain star: team owner of an APPROVED team gets the ★ next to their name
  const isCaptain = !!(team && team.status === 'approved' &&
    team.ownerUsername && team.ownerUsername.toLowerCase() === account.username.toLowerCase());

  // Award winners get a black label across the name; TOTW marker (above OVR)
  // is independent of awards, so a player can have both.
  const ovrY = isTotw ? 132 : 118;
  const posY = isTotw ? 160 : 146;

  // A unique id suffix so multiple cards on the same page get unique <defs>
  const uid = `${overall}-${tier.name}-${account.username || 'p'}`;

  const cardFrontSvg = (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={dims.w}
      height={dims.h}
      style={{ display: 'block' }}
    >
      <defs>
        {/* v33: brushed metallic body — light/mid/dark/shadow gradient. */}
        <linearGradient id={`base-${uid}`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor={palette.lightest} />
          <stop offset="25%" stopColor={palette.light} />
          <stop offset="55%" stopColor={palette.mid} />
          <stop offset="85%" stopColor={palette.dark} />
          <stop offset="100%" stopColor={palette.shadow} />
        </linearGradient>
        {/* Vertical sheen overlay for uneven metal-surface lighting */}
        <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={palette.shadow} stopOpacity="0.25" />
          <stop offset="20%" stopColor={palette.lightest} stopOpacity="0.35" />
          <stop offset="50%" stopColor={palette.mid} stopOpacity="0" />
          <stop offset="80%" stopColor={palette.light} stopOpacity="0.18" />
          <stop offset="100%" stopColor={palette.shadow} stopOpacity="0.3" />
        </linearGradient>
        {/* Bottom stats panel: distinct lighter surface */}
        <linearGradient id={`panel-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.panelLight} />
          <stop offset="50%" stopColor={palette.panelMid} />
          <stop offset="100%" stopColor={palette.panelDark} />
        </linearGradient>
        {/* Brushed-metal hairlines pattern */}
        <pattern id={`brush-${uid}`} x="0" y="0" width="3" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <line x1="0" y1="0" x2="0" y2="80" stroke={palette.shadow} strokeWidth="0.18" opacity="0.18" />
        </pattern>
        {/* Halftone dots covering the top half */}
        <pattern id={`dots-${uid}`} x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="0.7" fill={palette.shadow} opacity="0.35" />
        </pattern>
        {/* Player photo soft feather: photo blends into the gold body */}
        <radialGradient id={`ph-fade-${uid}`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`ph-mask-${uid}`}>
          <rect width="320" height="510" fill="black" />
          <rect x="50" y="-10" width="290" height="310" fill={`url(#ph-fade-${uid})`} />
        </mask>
        <clipPath id={`cc-${uid}`}><path d={cardPath} /></clipPath>
        <clipPath id={`top-clip-${uid}`}><rect x="0" y="0" width="320" height="293" /></clipPath>
      </defs>

      {/* 1. METALLIC CARD BASE + sheen + brushed hairlines */}
      <path d={cardPath} fill={`url(#base-${uid})`} />
      <g clipPath={`url(#cc-${uid})`}>
        <rect width="320" height="510" fill={`url(#sheen-${uid})`} />
        <rect width="320" height="510" fill={`url(#brush-${uid})`} />
      </g>

      {/* 2. TOP HALF: halftone dots + player photo */}
      <g clipPath={`url(#top-clip-${uid})`}>
        <g clipPath={`url(#cc-${uid})`}>
          <rect x="0" y="0" width="320" height="293" fill={`url(#dots-${uid})`} opacity="0.5" />
          {account.imageUrl && (
            <g mask={`url(#ph-mask-${uid})`} opacity="0.62">
              <image href={account.imageUrl} x="50" y="-10" width="290" height="310" preserveAspectRatio="xMidYMid slice" />
            </g>
          )}
        </g>
      </g>

      {/* 3. DIVIDER LINE between photo area and stats panel */}
      <g clipPath={`url(#cc-${uid})`}>
        <line x1="20" y1="293" x2="300" y2="293" stroke={palette.shadow} strokeWidth="1" opacity="0.45" />
        <line x1="20" y1="294" x2="300" y2="294" stroke={palette.lightest} strokeWidth="0.4" opacity="0.6" />
        <rect x="0" y="293" width="320" height="217" fill={`url(#panel-${uid})`} />
        <line x1="20" y1="295" x2="300" y2="295" stroke={palette.lightest} strokeWidth="0.5" opacity="0.6" />
      </g>

      {/* 4. TOTW MARKER (above OVR, big and prominent) */}
      {isTotw && (
        <text x="47" y="78" fontFamily="Anton, sans-serif" fontSize="22" fill="#2196f3" textAnchor="middle" letterSpacing="2.5" style={{ paintOrder: 'stroke', stroke: '#0d47a1', strokeWidth: 0.9 }}>TOTW</text>
      )}

      {/* 5. OVR + POS + FLAG + TEAM (left column, centered at x=47) */}
      <text x="47" y={ovrY} fontFamily="Anton, sans-serif" fontSize="42" fill={palette.text} textAnchor="middle" letterSpacing="-0.5">{displayOverall}</text>
      <text x="47" y={posY} fontFamily="Anton, sans-serif" fontSize="18" fill={palette.text} textAnchor="middle" letterSpacing="2">{account.position}</text>

      {account.country && flagUrl(account.country) && (
        <g>
          <rect x="32" y="177" width="30" height="20" rx="2" fill={palette.text} fillOpacity="0.18" stroke={palette.shadow} strokeWidth="0.5" strokeOpacity="0.5" />
          <image href={flagUrl(account.country)} x="33" y="178" width="28" height="18" preserveAspectRatio="xMidYMid slice" />
        </g>
      )}

      {!hideTeam && (team ? (
        team.logoUrl ? (
          <g>
            <circle cx="47" cy="222" r="14" fill="#ffffff" stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.55" />
            <image href={team.logoUrl} x="33" y="208" width="28" height="28" preserveAspectRatio="xMidYMid meet" clipPath={`circle(13px at 14px 14px)`} />
          </g>
        ) : (
          <g>
            <circle cx="47" cy="222" r="14" fill={team.color || '#1a5c2c'} stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.55" />
            <text x="47" y="226" fontFamily="Russo One, sans-serif" fontSize="10" fill="#fff" textAnchor="middle" letterSpacing="0.3">{team.tag}</text>
          </g>
        )
      ) : (
        <g transform="translate(47 222)">
          <circle r="14" fill={palette.lightest} fillOpacity="0.25" stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.55" strokeDasharray="2 2" />
          <text y="-2" fontFamily="Russo One, sans-serif" fontSize="6" fill={palette.text} textAnchor="middle">FREE</text>
          <text y="6" fontFamily="Russo One, sans-serif" fontSize="6" fill={palette.text} textAnchor="middle">AGENT</text>
        </g>
      ))}

      {/* 6. NAME — full-width black label if player has awards */}
      {hasAwards ? (
        <g>
          <g clipPath={`url(#cc-${uid})`}>
            <rect x="0" y="305" width="320" height="34" fill="#000000" opacity="0.94" />
            <line x1="0" y1="305" x2="320" y2="305" stroke={palette.awardText} strokeWidth="0.6" opacity="0.55" />
            <line x1="0" y1="339" x2="320" y2="339" stroke={palette.awardText} strokeWidth="0.6" opacity="0.55" />
          </g>
          <text x="160" y="328" fontFamily="Anton, sans-serif" fontSize="22" fill={palette.awardText} textAnchor="middle" letterSpacing="2.5">{(account.username || '').toUpperCase().slice(0, 14)}</text>
          {isCaptain && (
            <text x="46" y="328" fontSize="20" textAnchor="middle" fill="#000"
              stroke="#fff" strokeWidth="1" style={{ paintOrder: 'stroke' }}
              aria-label="Captain">★</text>
          )}
        </g>
      ) : (
        <g>
          <text x="160" y="326" fontFamily="Anton, sans-serif" fontSize="22" fill={palette.text} textAnchor="middle" letterSpacing="2.5">{(account.username || '').toUpperCase().slice(0, 14)}</text>
          <line x1="55" y1="338" x2="265" y2="338" stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.6" />
          {isCaptain && (
            <text x="46" y="326" fontSize="20" textAnchor="middle" fill="#000"
              stroke="#fff" strokeWidth="1" style={{ paintOrder: 'stroke' }}
              aria-label="Captain">★</text>
          )}
        </g>
      )}

      {/* 7. STATS GRID 3x2 — center-anchored numbers, symmetric around x=160 */}
      {/* Only shows stats tracked by Strikers Club. For GK cards, right column
          swaps to SAV/CAT/CS%; for field players it's TKL/W-L/GP. */}
      <g fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fill={palette.text}>
        <text x="62" y="364" fontSize="20" textAnchor="middle">{displayStats.goals}</text>
        <text x="100" y="364" fontSize="11" letterSpacing="1.5">GOALS</text>
        <text x="62" y="390" fontSize="20" textAnchor="middle">{displayStats.assists}</text>
        <text x="100" y="390" fontSize="11" letterSpacing="1.5">ASSIST</text>
        <text x="62" y="416" fontSize="20" textAnchor="middle">{Number(displayStats.passes || 0).toFixed(1)}</text>
        <text x="100" y="416" fontSize="11" letterSpacing="1.5">PASS</text>

        {position === 'GK' ? (
          <>
            <text x="220" y="364" fontSize="20" textAnchor="middle">{displayStats.deflects || 0}</text>
            <text x="256" y="364" fontSize="11" letterSpacing="1.5">DFL</text>
            <text x="220" y="390" fontSize="20" textAnchor="middle">{displayStats.catches || 0}</text>
            <text x="256" y="390" fontSize="11" letterSpacing="1.5">CATCH</text>
            <text x="220" y="416" fontSize="20" textAnchor="middle">{displayStats.cleanSheets || 0}</text>
            <text x="256" y="416" fontSize="11" letterSpacing="1.5">CS</text>
          </>
        ) : (
          <>
            <text x="220" y="364" fontSize="20" textAnchor="middle">{Number(displayStats.tackles || 0).toFixed(1)}</text>
            <text x="256" y="364" fontSize="11" letterSpacing="1.5">TKL</text>
            <text x="220" y="390" fontSize="20" textAnchor="middle">{(displayStats.wins || 0)}-{(displayStats.losses || 0)}</text>
            <text x="256" y="390" fontSize="11" letterSpacing="1.5">W-L</text>
            <text x="220" y="416" fontSize="20" textAnchor="middle">{displayStats.games || 0}</text>
            <text x="256" y="416" fontSize="11" letterSpacing="1.5">GP</text>
          </>
        )}
      </g>
      <line x1="160" y1="348" x2="160" y2="422" stroke={palette.shadow} strokeWidth="0.7" strokeOpacity="0.55" />

      {/* 8. ASL logo at bottom center */}
      <image href={ASL_LOGO_DIAMOND} x="139" y="431" width="42" height="42" preserveAspectRatio="xMidYMid meet" opacity="0.9" />

      {/* CHEATER STAMP — giant diagonal red text overlaying the whole card,
          bottom-left to top-right. Clipped to the card shape so it doesn't
          escape the outline. Uses dominantBaseline="central" so the text
          centers vertically on the rotation point. */}
      {isCheater && (
        <g clipPath={`url(#cc-${uid})`}>
          {/* darker dimming layer so the red really pops */}
          <rect width="320" height="510" fill="#000" opacity="0.5" />
          <g transform="translate(160 255) rotate(-32)">
            {/* outer red glow halo for prominence */}
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="#ff0000" opacity="0.35"
              style={{ filter: 'blur(4px)' }}
            >CHEATER</text>
            {/* main stamp text — thick dark stroke for stamped-on look */}
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="#e60000"
              style={{ paintOrder: 'stroke', stroke: '#400000', strokeWidth: 4 }}
            >CHEATER</text>
            {/* inner highlight stroke for definition */}
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="none" stroke="#ff8888" strokeWidth="0.8" opacity="0.85"
            >CHEATER</text>
          </g>
        </g>
      )}

      {/* 9. Outer stroke + inner highlight */}
      <path d={cardPath} fill="none" stroke={palette.shadow} strokeWidth="1.8" strokeOpacity="0.8" />
      <path d={cardPath} fill="none" stroke={palette.lightest} strokeWidth="0.5" strokeOpacity="0.8" transform="translate(0 -0.5)" />
    </svg>
  );

  // ---- BACK OF THE CARD: trophies + join date ----
  const AWARD_FULL_NAMES = {
    glove: 'Golden Glove',
    striker: 'Golden Striker',
    defender: 'Golden Defender',
    playmaker: 'Golden Playmaker',
  };
  // Force en-US locale + short month so the label fits inside the card width
  // regardless of the viewer's browser locale.
  const joinDate = account.createdAt
    ? new Date(account.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Unknown';
  // Combined cabinet items: individual awards + team championships. Each is
  // tagged with a kind so the renderer picks the right icon.
  const cabinetItems = [
    ...awards.map(a => ({ kind: 'award', awardId: a.awardId, season: a.season })),
    ...(account.championships || []).map(c => ({
      kind: 'champ',
      placement: c.placement,             // 'winner' | 'runner_up'
      season: c.season,
    })),
  ].slice(0, 10);

  const cardBackSvg = (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={dims.w}
      height={dims.h}
      style={{ display: 'block' }}
    >
      <defs>
        {/* Same metallic body as the front, so the back feels like the same object */}
        <linearGradient id={`b-base-${uid}`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor={palette.lightest} />
          <stop offset="25%" stopColor={palette.light} />
          <stop offset="55%" stopColor={palette.mid} />
          <stop offset="85%" stopColor={palette.dark} />
          <stop offset="100%" stopColor={palette.shadow} />
        </linearGradient>
        <linearGradient id={`b-sheen-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={palette.shadow} stopOpacity="0.25" />
          <stop offset="20%" stopColor={palette.lightest} stopOpacity="0.35" />
          <stop offset="50%" stopColor={palette.mid} stopOpacity="0" />
          <stop offset="80%" stopColor={palette.light} stopOpacity="0.18" />
          <stop offset="100%" stopColor={palette.shadow} stopOpacity="0.3" />
        </linearGradient>
        <pattern id={`b-brush-${uid}`} x="0" y="0" width="3" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <line x1="0" y1="0" x2="0" y2="80" stroke={palette.shadow} strokeWidth="0.18" opacity="0.18" />
        </pattern>
        <pattern id={`b-dots-${uid}`} x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="0.7" fill={palette.shadow} opacity="0.35" />
        </pattern>
        <clipPath id={`b-cc-${uid}`}><path d={cardPath} /></clipPath>
      </defs>

      {/* Metallic body (same as front, no photo) */}
      <path d={cardPath} fill={`url(#b-base-${uid})`} />
      <g clipPath={`url(#b-cc-${uid})`}>
        <rect width="320" height="510" fill={`url(#b-sheen-${uid})`} />
        <rect width="320" height="510" fill={`url(#b-brush-${uid})`} />
        {/* Halftone dots over the whole card (no photo to compete with) */}
        <rect width="320" height="510" fill={`url(#b-dots-${uid})`} opacity="0.4" />
      </g>

      {/* Header band at top — black bar with player name + position + OVR */}
      <g clipPath={`url(#b-cc-${uid})`}>
        <rect x="0" y="0" width="320" height="80" fill="#000000" opacity="0.78" />
        <line x1="0" y1="80" x2="320" y2="80" stroke={palette.awardText} strokeWidth="0.8" opacity="0.5" />
      </g>
      <text x="160" y="38" fontFamily="Anton, sans-serif" fontSize="22" fill={palette.awardText} textAnchor="middle" letterSpacing="2.5">{(account.username || '').toUpperCase().slice(0, 16)}</text>
      <text x="160" y="60" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.awardText} textAnchor="middle" letterSpacing="2.5" opacity="0.85">
        {account.position} · {displayOverall} OVR{isTotw ? ' · TOTW' : ''}
      </text>

      {/* TROPHY CABINET section */}
      <text x="22" y="106" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.text} letterSpacing="2.5">TROPHY CABINET</text>
      <line x1="22" y1="112" x2="298" y2="112" stroke={palette.shadow} strokeWidth="0.6" opacity="0.55" />

      {cabinetItems.length === 0 ? (
        <text x="160" y="180" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.text} textAnchor="middle" opacity="0.55" letterSpacing="1.5">NO TROPHIES YET</text>
      ) : cabinetItems.map((item, i) => {
        const y = 130 + i * 22;
        if (item.kind === 'champ') {
          const label = item.placement === 'runner_up' ? 'RUNNER-UP' : 'CHAMPION';
          return (
            <g key={`item-${i}`} transform={`translate(22 ${y})`}>
              <text x="0" y="0" fontSize="14" fill={palette.awardText}>🏆</text>
              <text x="22" y="0" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize="13" fill={palette.text}>{label}</text>
              {item.season && (
                <text x="276" y="0" fontFamily="Russo One, sans-serif" fontSize="10" fill={palette.text} opacity="0.8" textAnchor="end">{item.season}</text>
              )}
            </g>
          );
        }
        // award
        const fullName = (AWARD_FULL_NAMES[item.awardId] || item.awardId || '').toUpperCase();
        return (
          <g key={`item-${i}`} transform={`translate(22 ${y})`}>
            <circle cx="6" cy="-4" r="3" fill={palette.awardText} />
            <text x="20" y="0" fontFamily="Barlow Condensed, sans-serif" fontWeight="600" fontSize="13" fill={palette.text}>{fullName}</text>
            {item.season && (
              <text x="276" y="0" fontFamily="Russo One, sans-serif" fontSize="10" fill={palette.text} opacity="0.65" textAnchor="end">{item.season}</text>
            )}
          </g>
        );
      })}

      {/* MEMBER SINCE footer */}
      <line x1="80" y1="445" x2="240" y2="445" stroke={palette.shadow} strokeWidth="0.5" opacity="0.4" />
      <text x="160" y="460" fontFamily="Russo One, sans-serif" fontSize="9" fill={palette.text} textAnchor="middle" opacity="0.65" letterSpacing="2">MEMBER SINCE</text>
      <text x="160" y="476" fontFamily="Anton, sans-serif" fontSize="14" fill={palette.text} textAnchor="middle" letterSpacing="2">{joinDate}</text>

      {/* Outer + inner edge */}
      <path d={cardPath} fill="none" stroke={palette.shadow} strokeWidth="1.8" strokeOpacity="0.8" />
      <path d={cardPath} fill="none" stroke={palette.lightest} strokeWidth="0.5" strokeOpacity="0.8" transform="translate(0 -0.5)" />
    </svg>
  );

  // Non-flippable (small/medium cards): just show the front
  if (!canFlip) {
    return (
      <div
        ref={ref}
        className="relative select-none transition-all hover:scale-[1.03] hover:-translate-y-1 duration-300"
        style={{
          width: dims.w, height: dims.h,
          filter: `drop-shadow(0 8px 20px rgba(0,0,0,0.35))`,
        }}
      >
        {cardFrontSvg}
      </div>
    );
  }

  // Flippable large card
  return (
    <div
      ref={ref}
      className={`flip-card ${flipped ? 'flipped' : ''}`}
      onClick={() => setFlipped(f => !f)}
      style={{
        width: dims.w, height: dims.h,
        filter: `drop-shadow(0 8px 20px rgba(0,0,0,0.35))`,
      }}
      title="Click to flip"
    >
      <div className="flip-card-inner">
        <div className="flip-card-face">{cardFrontSvg}</div>
        <div className="flip-card-face flip-card-back">{cardBackSvg}</div>
      </div>
    </div>
  );
});
PlayerCard.displayName = 'PlayerCard';

const CardStat = ({ label, value, valueSize, labelSize }) => (
  <div className="flex items-baseline gap-1.5 font-heading">
    <span style={{ fontSize: valueSize, fontWeight: 700 }}>{value}</span>
    <span className="opacity-70 tracking-widest" style={{ fontSize: labelSize }}>{label}</span>
  </div>
);

const CardStatBar = ({ label, value, valueSize, labelSize, accent, maxValue = 99, suffix = '' }) => {
  const pct = maxValue > 0 ? Math.min(100, Math.max(0, (value / maxValue) * 100)) : 0;
  return (
    <div className="font-heading">
      <div className="flex justify-between items-baseline">
        <span className="opacity-70 tracking-widest" style={{ fontSize: labelSize }}>{label}</span>
        <span style={{ fontSize: valueSize, fontWeight: 700 }}>{value}{suffix}</span>
      </div>
      <div style={{
        height: 3,
        background: `${accent}22`,
        borderRadius: 2,
        marginTop: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: `linear-gradient(to right, ${accent}aa, ${accent})`,
        }} />
      </div>
    </div>
  );
};

// ============ AUTH SCREEN ============
const AuthScreen = ({ onLogin }) => {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState('ST');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Simple email format check
  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  // "Forgot password" — sends a reset link to the account's email
  const handleForgotPassword = async () => {
    setError(''); setInfo('');
    if (!username.trim()) { setError('Enter your username first, then tap "Forgot password".'); return; }
    setLoading(true);
    try {
      const res = await auth.sendPasswordReset(username.trim());
      if (res.ok) {
        setInfo(`A password reset link has been sent to ${res.email}. Check your inbox (and spam folder).`);
      } else {
        setError(res.reason || 'Could not send a reset link.');
      }
    } catch (e) {
      setError(e?.message || 'Could not send a reset link.');
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    setError(''); setInfo('');
    if (!username.trim() || !password.trim()) { setError('Username and password required'); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError('Letters, numbers, and underscores only'); return; }
    // Sign-up only: profanity check, email, and country are required
    if (mode === 'signup') {
      if (checkUsernameProfanity(username)) {
        setError('That username isn\'t allowed. Please choose a different one.');
        return;
      }
      if (!isValidEmail(email)) { setError('Please enter a valid email address'); return; }
      if (!country) { setError('Please select your country'); return; }
    }
    setLoading(true);
    try {
      let account;
      if (mode === 'signup') {
        account = await auth.signUp({
          username: username.trim(), password, position,
          email: email.trim(), country,
        });
      } else {
        account = await auth.signIn({ username: username.trim(), password });
      }
      if (!account) throw new Error('Could not load account');
      onLogin(account);
    } catch (e) {
      console.error('Auth error:', e);
      setError(e?.message ? `Error: ${e.message}` : 'Something went wrong');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pitch-bg relative overflow-hidden">
      {/* Pitch lines decoration */}
      <div className="absolute inset-0 pitch-lines opacity-30" />

      <div className="relative w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <ASLCrest size={110} />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full" style={{
            border: `1px solid ${C.green}66`,
            background: `${C.green}11`,
          }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.greenLight }} />
            <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: C.greenLight }}>LEAGUE PORTAL</span>
          </div>
          <h1 className="font-display text-7xl tracking-tight leading-none mb-1" style={{ color: C.cream }}>ASL</h1>
          <p className="font-heading text-sm tracking-[0.3em]" style={{ color: C.cream, opacity: 0.7 }}>ALLIANCE STRIKERS LEAGUE</p>
          <p className="font-mono text-[10px] tracking-widest mt-2" style={{ color: C.cream, opacity: 0.4 }}>// STRIKERS CLUB</p>
        </div>

        <div className="backdrop-blur-md rounded-xl p-7 relative" style={{
          background: C.white,
          border: `1px solid ${C.navyLight}`,
          boxShadow: `0 20px 60px ${C.brandNavy}22, inset 0 1px 0 ${C.white}`,
        }}>
          <div className="flex gap-1 mb-6 p-1 rounded" style={{ background: `${C.navyDeep}` }}>
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className="flex-1 py-2 font-heading tracking-wider text-xs transition-all rounded"
              style={{
                background: mode === 'login' ? C.green : 'transparent',
                color: mode === 'login' ? C.onColor : `${C.cream}77`,
                boxShadow: mode === 'login' ? `0 2px 8px ${C.green}66` : 'none',
              }}
            >SIGN IN</button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className="flex-1 py-2 font-heading tracking-wider text-xs transition-all rounded"
              style={{
                background: mode === 'signup' ? C.green : 'transparent',
                color: mode === 'signup' ? C.onColor : `${C.cream}77`,
                boxShadow: mode === 'signup' ? `0 2px 8px ${C.green}66` : 'none',
              }}
            >REGISTER</button>
          </div>

          <div className="space-y-3">
            <Field label="USERNAME">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 font-body text-base focus:outline-none rounded"
                placeholder="your_gamertag"
                style={{ background: `${C.navyDeep}`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              />
            </Field>
            <Field label="PASSWORD">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="w-full px-3 py-2 font-body text-base focus:outline-none rounded"
                placeholder="••••••••"
                style={{ background: `${C.navyDeep}`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              />
            </Field>
            {mode === 'signup' && (
              <Field label="PRIMARY POSITION">
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full px-3 py-2 font-body text-base focus:outline-none rounded"
                  style={{ background: `${C.navyDeep}`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
                >
                  {POSITIONS.map(p => <option key={p} value={p} style={{ background: C.navyDeep }}>{p}</option>)}
                </select>
              </Field>
            )}
            {mode === 'signup' && (
              <Field label="EMAIL">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 font-body text-base focus:outline-none rounded"
                  placeholder="you@example.com"
                  style={{ background: `${C.navyDeep}`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
                />
              </Field>
            )}
            {mode === 'signup' && (
              <Field label="COUNTRY">
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 font-body text-base focus:outline-none rounded"
                  style={{ background: `${C.navyDeep}`, border: `1px solid ${C.navyLight}66`, color: country ? C.cream : `${C.cream}66` }}
                >
                  <option value="" style={{ background: C.navyDeep }}>Select your country…</option>
                  {COUNTRIES.map(c => <option key={c} value={c} style={{ background: C.navyDeep }}>{c}</option>)}
                </select>
              </Field>
            )}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded font-mono text-xs" style={{
                background: `${C.red}22`, border: `1px solid ${C.red}66`, color: C.redLight,
              }}>
                <XCircle size={12} /> {error}
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 px-3 py-2 rounded font-mono text-xs" style={{
                background: `${C.green}22`, border: `1px solid ${C.green}66`, color: C.greenLight,
              }}>
                <CheckCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} /> {info}
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 font-display tracking-[0.15em] text-xl transition-all disabled:opacity-50 rounded mt-2"
              style={{
                background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
                color: C.onColor,
                boxShadow: `0 4px 16px ${C.green}66, inset 0 1px 0 ${C.white}30`,
              }}
            >
              {loading ? 'LOADING...' : mode === 'login' ? 'ENTER LEAGUE' : 'JOIN THE LEAGUE'}
            </button>

            {/* DIVIDER + DISCORD OAUTH */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px" style={{ background: `${C.cream}22` }} />
              <span className="font-mono text-[9px] tracking-widest" style={{ color: `${C.cream}55` }}>OR</span>
              <div className="flex-1 h-px" style={{ background: `${C.cream}22` }} />
            </div>
            <button
              type="button"
              onClick={async () => {
                setError(''); setInfo(''); setLoading(true);
                const res = await auth.signInWithDiscord();
                if (!res.ok) { setError(res.reason || 'Could not start Discord sign-in.'); setLoading(false); }
                // On success, Supabase redirects the browser to Discord, then back.
                // The SIGNED_IN handler in App.jsx picks it up from there.
              }}
              disabled={loading}
              className="w-full py-3 font-display tracking-[0.15em] text-lg rounded disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: '#5865F2',
                color: '#ffffff',
                boxShadow: '0 4px 16px #5865F266, inset 0 1px 0 #ffffff30',
              }}
            >
              {/* Discord logo (inline SVG) */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z"/>
              </svg>
              SIGN IN WITH DISCORD
            </button>

            {mode === 'login' && (
              <button
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full font-mono text-[11px] tracking-wider disabled:opacity-50 mt-1"
                style={{ color: `${C.cream}88`, textDecoration: 'underline' }}
              >Forgot my password</button>
            )}
          </div>

          <div className="mt-5 pt-4 text-center" style={{ borderTop: `1px solid ${C.navyLight}33` }}>
            <p className="font-mono text-[10px] tracking-wider" style={{ color: `${C.cream}55` }}>
              {mode === 'signup' ? 'BY REGISTERING, YOU JOIN THE OFFICIAL LEAGUE' : 'WELCOME BACK, BALLER'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{label}</label>
    {children}
  </div>
);

// ============ MODAL WRAPPER ============
const ModalShell = ({ onClose, title, children, maxWidth = 'max-w-2xl' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{
    background: `${C.black}cc`, backdropFilter: 'blur(8px)',
  }}>
    <div className={`${maxWidth} w-full my-8 rounded-xl fade-in relative`} style={{
      background: C.white,
      border: `1px solid ${C.navyLight}`,
      boxShadow: `0 20px 60px ${C.brandNavy}33`,
    }}>
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{
        background: `linear-gradient(90deg, ${C.brandNavy} 0%, ${C.green} 50%, ${C.red} 100%)`,
      }} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <ASLCrest size={28} />
            <h2 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded transition-all hover:scale-110" style={{
            background: `${C.navyLight}44`, color: C.cream,
          }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  </div>
);

// ============ LOG MATCH MODAL ============
const LogMatchModal = ({ account, allPlayers, currentSeason, onClose, onSave }) => {
  const [form, setForm] = useState({
    opponent: '', opponentTeamId: '', result: 'W',
    goals: 0, assists: 0, tackles: 0,
    passes: 0,
    cleanSheet: false, deflects: 0, catches: 0, motm: false,
    teammates: [], season: currentSeason,
  });
  const [teams, setTeams] = useState([]);
  useEffect(() => { db.listTeams().then(t => setTeams(t.filter(x => x.status === 'approved'))); }, []);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inputStyle = {
    background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream,
  };
  const num = (k) => ({
    type: 'number', min: 0, value: form[k],
    onChange: (e) => update(k, parseInt(e.target.value) || 0),
    className: 'w-full rounded px-2 py-1.5 font-mono text-sm focus:outline-none',
    style: inputStyle,
  });

  const handleSave = async () => {
    const newMatch = { ...form, date: Date.now(), id: `m_${Date.now()}_${Math.random().toString(36).slice(2,8)}` };
    const updatedMatches = [newMatch, ...(account.matches || [])].slice(0, 200);
    const lifetime = emptyStats();
    let totalPasses = 0;
    for (const m of updatedMatches) {
      lifetime.games += 1;
      lifetime.goals += m.goals || 0;
      lifetime.assists += m.assists || 0;
      lifetime.tackles += m.tackles || 0;
      lifetime.deflects += m.deflects || 0;
      lifetime.catches += m.catches || 0;
      if (m.cleanSheet) lifetime.cleanSheets += 1;
      if (m.motm) lifetime.motm += 1;
      if (m.result === 'W') lifetime.wins += 1;
      else if (m.result === 'L') lifetime.losses += 1;
      else lifetime.draws += 1;
      totalPasses += m.passes || 0;
    }
    if (lifetime.games > 0) {
      lifetime.passes = Math.round(totalPasses / lifetime.games);
    }
    const updated = { ...account, stats: lifetime, matches: updatedMatches };
    await db.saveAccount(updated);
    onSave(updated);
    onClose();
  };

  const teammateOptions = allPlayers.filter(p => p.username !== account.username);
  const Lbl = ({ children }) => <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{children}</label>;

  return (
    <ModalShell onClose={onClose} title="LOG MATCH">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Lbl>OPPONENT TEAM</Lbl>
            <select
              value={form.opponentTeamId}
              onChange={(e) => {
                const t = teams.find(x => x.id === e.target.value);
                update('opponentTeamId', e.target.value);
                if (t) update('opponent', t.name);
              }}
              className="w-full rounded px-2 py-1.5 font-body text-sm focus:outline-none"
              style={inputStyle}
            >
              <option value="" style={{ background: C.navyDeep }}>— Custom / unknown —</option>
              {teams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <Lbl>OPPONENT NAME</Lbl>
            <input
              type="text"
              value={form.opponent}
              onChange={(e) => update('opponent', e.target.value)}
              placeholder="e.g. FC Lightning"
              className="w-full rounded px-2 py-1.5 font-body text-sm focus:outline-none"
              style={inputStyle}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Lbl>SEASON</Lbl>
            <input
              type="text"
              value={form.season}
              onChange={(e) => update('season', e.target.value.toUpperCase())}
              className="w-full rounded px-2 py-1.5 font-mono text-sm focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <Lbl>RESULT</Lbl>
            <div className="flex gap-1">
              {['W', 'D', 'L'].map(r => {
                const active = form.result === r;
                const bg = r === 'W' ? C.green : r === 'L' ? C.red : C.gold;
                return (
                  <button
                    key={r}
                    onClick={() => update('result', r)}
                    className="flex-1 py-1.5 font-display text-lg transition-all rounded"
                    style={{
                      background: active ? bg : `${C.navyDeep}`,
                      color: active ? C.onColor : `${C.cream}55`,
                      border: `1px solid ${active ? bg : C.navyLight}66`,
                      boxShadow: active ? `0 2px 8px ${bg}66` : 'none',
                    }}
                  >{r}</button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
          <div className="font-heading text-xs tracking-widest mb-2" style={{ color: C.greenLight }}>ATTACKING</div>
          <div className="grid grid-cols-2 gap-2">
            <div><Lbl>GOALS</Lbl><input {...num('goals')} /></div>
            <div><Lbl>ASSISTS</Lbl><input {...num('assists')} /></div>
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
          <div className="font-heading text-xs tracking-widest mb-2" style={{ color: C.goldLight }}>POSSESSION</div>
          <div className="grid grid-cols-1 gap-2">
            <div><Lbl>PASSES</Lbl><input {...num('passes')} /></div>
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
          <div className="font-heading text-xs tracking-widest mb-2" style={{ color: C.redLight }}>DEFENSIVE</div>
          <div className="grid grid-cols-3 gap-2">
            <div><Lbl>TACKLES</Lbl><input {...num('tackles')} /></div>
            <div><Lbl>DEFLECTS</Lbl><input {...num('deflects')} /></div>
            <div><Lbl>CATCHES</Lbl><input {...num('catches')} /></div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => update('cleanSheet', !form.cleanSheet)}
            className="w-full py-2 font-heading tracking-wider text-xs transition-all flex items-center justify-center gap-2 rounded"
            style={{
              background: form.cleanSheet ? C.greenLight : `${C.navyDeep}`,
              color: form.cleanSheet ? C.onColor : `${C.cream}77`,
              border: `1px solid ${form.cleanSheet ? C.greenLight : C.navyLight}66`,
            }}
          ><Shield size={14} /> CLEAN SHEET</button>
        </div>

        {teammateOptions.length > 0 && (
          <div>
            <Lbl>TEAMMATES IN MATCH (OPTIONAL)</Lbl>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 rounded" style={{
              background: C.navyDeep, border: `1px solid ${C.navyLight}66`,
            }}>
              {teammateOptions.map(p => {
                const sel = form.teammates.includes(p.username);
                return (
                  <button
                    key={p.username}
                    onClick={() => update('teammates', sel ? form.teammates.filter(t => t !== p.username) : [...form.teammates, p.username])}
                    className="px-2 py-0.5 rounded font-mono text-[10px] transition-all"
                    style={{
                      background: sel ? C.green : `${C.navyLight}33`,
                      color: sel ? C.onColor : `${C.cream}99`,
                    }}
                  >{p.username}</button>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          className="w-full py-3 font-display tracking-[0.15em] text-xl rounded mt-2"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor,
            boxShadow: `0 4px 16px ${C.green}66, inset 0 1px 0 ${C.white}30`,
          }}
        >SUBMIT MATCH</button>
      </div>
    </ModalShell>
  );
};

// ============ EDIT POSITION MODAL ============
// ============ UPLOAD IMAGE MODAL ============
// Compresses uploaded image to ~400px max dimension and stores it as data URL on account
const compressImage = (file, maxDim = 400, quality = 0.82) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read file'));
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not load image'));
    img.onload = () => {
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try {
        // Use JPEG (smaller). PNG would be 3-5x bigger.
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

const UploadImageModal = ({ account, onClose, onSave }) => {
  // Show the pending image if there is one, else the live image
  const [preview, setPreview] = useState(account.pendingImageUrl || account.imageUrl || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const dataUrl = await compressImage(file, 400, 0.82);
      setPreview(dataUrl);
    } catch (e) {
      setError('Could not process image: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      if (preview === null) {
        // Removing the picture entirely — this takes effect immediately
        // (removing isn't something that needs moderation)
        const updated = { ...account, imageUrl: null, pendingImageUrl: null };
        await db.saveAccount(updated);
        onSave(updated);
      } else if (preview === account.imageUrl) {
        // No change
        onClose();
        setBusy(false);
        return;
      } else {
        // New picture — goes to pending, awaits admin approval.
        // The old imageUrl stays live until an admin approves.
        const updated = { ...account, pendingImageUrl: preview };
        await db.saveAccount(updated);
        onSave(updated);
        setSubmitted(true);
        setBusy(false);
        return;
      }
      onClose();
    } catch (e) {
      setError('Could not save: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const handleRemove = () => {
    setPreview(null);
  };

  // After submitting a new picture for review, show a confirmation instead
  if (submitted) {
    return (
      <ModalShell onClose={onClose} title="PLAYER IMAGE" maxWidth="max-w-md">
        <div className="text-center py-6 space-y-3">
          <div className="flex justify-center">
            <Clock size={48} style={{ color: C.goldLight }} />
          </div>
          <div className="font-display text-2xl tracking-wider" style={{ color: C.brandNavy }}>
            SUBMITTED FOR REVIEW
          </div>
          <p className="font-body text-sm max-w-xs mx-auto" style={{ color: `${C.brandNavy}aa` }}>
            Your new picture has been sent to the league admins. It will appear on your card once approved. Your current picture stays until then.
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2.5 font-heading tracking-wider text-sm rounded"
            style={{ background: C.brandNavy, color: C.onColor }}
          >GOT IT</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="PLAYER IMAGE" maxWidth="max-w-md">
      <div className="space-y-4">
        {/* Pending notice if a picture is already awaiting review */}
        {account.pendingImageUrl && (
          <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{
            background: `${C.gold}18`, border: `1px solid ${C.gold}55`,
          }}>
            <Clock size={14} style={{ color: C.goldLight }} />
            <span className="font-mono text-[11px] tracking-wider" style={{ color: C.brandNavy }}>
              YOU HAVE A PICTURE AWAITING ADMIN REVIEW
            </span>
          </div>
        )}
        <div className="flex justify-center">
          <div className="relative" style={{
            width: 240, height: 240, overflow: 'hidden',
            borderRadius: 12,
            background: `${C.navyDeep}88`,
            border: `2px solid ${C.navyLight}66`,
          }}>
            {preview ? (
              <img src={preview} alt="preview" style={{
                width: '100%', height: '100%', objectFit: 'cover',
              }} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center font-mono text-xs tracking-wider" style={{ color: `${C.cream}55` }}>
                <User size={48} className="mb-2" />
                NO IMAGE
              </div>
            )}
          </div>
        </div>

        {/* Hidden file input + tap to pick */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex-1 py-2.5 font-heading tracking-wider text-xs rounded transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 2px 8px ${C.green}66`,
            }}
          >
            <Plus size={12} /> {preview ? 'CHANGE IMAGE' : 'PICK IMAGE'}
          </button>
          {preview && (
            <button
              onClick={handleRemove}
              disabled={busy}
              className="px-3 py-2.5 font-heading tracking-wider text-xs rounded"
              style={{
                background: `${C.red}22`, color: C.redLight,
                border: `1px solid ${C.red}66`,
              }}
            >REMOVE</button>
          )}
        </div>

        {error && (
          <div className="font-mono text-xs px-3 py-2 rounded" style={{
            background: `${C.red}22`, color: C.redLight, border: `1px solid ${C.red}44`,
          }}>{error}</div>
        )}

        <div className="font-mono text-[10px] tracking-wider text-center" style={{ color: `${C.cream}55` }}>
          IMAGES ARE AUTO-RESIZED TO 400PX. ANY IMAGE WORKS.
        </div>

        <button
          onClick={handleSave}
          disabled={busy}
          className="w-full py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50"
          style={{
            background: C.brandNavy, color: C.onColor,
            boxShadow: `0 2px 8px ${C.brandNavy}66`,
          }}
        >{busy ? 'SAVING...' : 'SAVE'}</button>
      </div>
    </ModalShell>
  );
};

const EditPositionModal = ({ account, onClose, onSave }) => {
  const [pos, setPos] = useState(account.position);
  const handleSave = async () => {
    const updated = { ...account, position: pos };
    await db.saveAccount(updated);
    onSave(updated);
    onClose();
  };
  return (
    <ModalShell onClose={onClose} title="POSITION" maxWidth="max-w-sm">
      <div className="grid grid-cols-2 gap-2 mb-4">
        {POSITIONS.map(p => {
          const active = pos === p;
          return (
            <button
              key={p}
              onClick={() => setPos(p)}
              className="py-4 font-display text-2xl transition-all rounded"
              style={{
                background: active ? C.green : `${C.navyDeep}`,
                color: active ? C.onColor : `${C.cream}88`,
                border: `1px solid ${active ? C.green : C.navyLight}66`,
                boxShadow: active ? `0 2px 8px ${C.green}66` : 'none',
              }}
            >{p}</button>
          );
        })}
      </div>
      <button
        onClick={handleSave}
        className="w-full py-3 font-display tracking-widest text-lg rounded"
        style={{
          background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
          color: C.onColor,
          boxShadow: `0 4px 16px ${C.green}66`,
        }}
      >SAVE POSITION</button>
    </ModalShell>
  );
};

// ============ EDIT NAME MODAL (player changes own username) ============
const EditNameModal = ({ account, onClose, onSave }) => {
  const [name, setName] = useState(account.username);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setError('');
    const trimmed = name.trim();
    if (trimmed === account.username) { onClose(); return; }
    if (trimmed.length < 3) { setError('Username must be at least 3 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setError('Letters, numbers, and underscores only'); return; }
    // Profanity filter applies to player self-rename
    if (checkUsernameProfanity(trimmed)) {
      setError('That username isn\'t allowed. Please choose a different one.');
      return;
    }
    setBusy(true);
    try {
      const result = await db.renameAccount(account.id, trimmed);
      if (!result.ok) { setError(result.reason || 'Could not change name'); setBusy(false); return; }
      onSave({ ...account, username: trimmed });
      onClose();
    } catch (e) {
      setError('Could not change name: ' + (e?.message || e));
    }
    setBusy(false);
  };

  return (
    <ModalShell onClose={onClose} title="CHANGE USERNAME" maxWidth="max-w-sm">
      <div className="space-y-3">
        <p className="font-body text-sm" style={{ color: `${C.cream}aa` }}>
          This is the name shown on your card and across the league. Letters, numbers, and underscores only.
        </p>
        <input
          type="text"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded px-3 py-3 text-base font-heading tracking-wider"
          style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
        />
        {error && <div className="font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}
        <button
          onClick={handleSave}
          disabled={busy}
          className="w-full py-3 font-display tracking-widest text-lg rounded disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor,
            boxShadow: `0 4px 16px ${C.green}66`,
          }}
        >{busy ? 'SAVING…' : 'SAVE USERNAME'}</button>
      </div>
    </ModalShell>
  );
};

// ============ SUBMIT TEAM MODAL ============
// ============ EDIT TEAM MODAL (admin) ============
// Admins can edit any approved team's visual properties — logo, name, tag,
// color, description. Member roster stays managed via the PLAYERS section.
const EditTeamModal = ({ team, onClose, onSaved }) => {
  const [name, setName] = useState(team.name || '');
  const [tag, setTag] = useState(team.tag || '');
  const [color, setColor] = useState(team.color || C.green);
  const [description, setDescription] = useState(team.description || '');
  const [logoUrl, setLogoUrl] = useState(team.logoUrl || null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const logoInputRef = useRef(null);

  const handleLogoFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Team logo must be an image file'); return; }
    setError('');
    setLogoBusy(true);
    try {
      const dataUrl = await compressImage(file, 300, 0.85);
      setLogoUrl(dataUrl);
    } catch (e) {
      setError('Could not process logo: ' + (e?.message || e));
    }
    setLogoBusy(false);
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim() || name.length < 3) { setError('Team name must be 3+ characters'); return; }
    if (!tag.trim() || tag.length < 2 || tag.length > 5) { setError('Tag must be 2-5 characters'); return; }
    if (!logoUrl) { setError('Team must have a logo'); return; }
    setLoading(true);
    try {
      await db.saveTeam({
        ...team,
        name: name.trim(),
        tag: tag.trim().toUpperCase(),
        color,
        description: description.trim(),
        logoUrl,
      });
      onSaved && onSaved();
    } catch (e) {
      setError('Could not save: ' + (e?.message || e));
    }
    setLoading(false);
  };

  const inputStyle = { background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream };
  const Lbl = ({ children }) => <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{children}</label>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.78)' }}>
      <div className="w-full max-w-md rounded-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div className="flex items-center justify-between">
          <div className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>EDIT TEAM</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/10" style={{ color: C.brandNavy }}>
            <X size={18} />
          </button>
        </div>

        <div>
          <Lbl>TEAM NAME</Lbl>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={28}
            className="w-full px-3 py-2 font-body text-sm rounded" style={inputStyle} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Lbl>TAG (2-5)</Lbl>
            <input type="text" value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={5}
              className="w-full px-3 py-2 font-body text-sm rounded" style={inputStyle} />
          </div>
          <div>
            <Lbl>TEAM COLOR</Lbl>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-full h-[42px] rounded cursor-pointer" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66` }} />
          </div>
        </div>

        <div>
          <Lbl>DESCRIPTION (OPTIONAL)</Lbl>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={200}
            className="w-full px-3 py-2 font-body text-sm rounded resize-none" style={inputStyle} />
        </div>

        <div>
          <Lbl>TEAM LOGO</Lbl>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded flex items-center justify-center shrink-0" style={{
              background: C.navyDeep, border: `1px solid ${C.navyLight}66`,
            }}>
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover rounded" />
              ) : (
                <Shield size={24} style={{ color: `${C.cream}55` }} />
              )}
            </div>
            <input type="file" accept="image/*" ref={logoInputRef} className="hidden"
              onChange={(e) => handleLogoFile(e.target.files?.[0])} />
            <button onClick={() => logoInputRef.current?.click()} disabled={logoBusy}
              className="px-3 py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
              style={{ background: `${C.navyLight}88`, color: C.brandNavy }}
            >{logoBusy ? 'PROCESSING...' : 'CHANGE LOGO'}</button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded font-mono text-xs" style={{
            background: `${C.red}22`, border: `1px solid ${C.red}66`, color: C.redLight,
          }}>
            <XCircle size={12} /> {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 font-heading tracking-wider text-[11px] rounded"
            style={{ background: `${C.navyLight}66`, color: C.brandNavy }}>CANCEL</button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`, color: C.onColor }}
          >{loading ? 'SAVING…' : 'SAVE CHANGES'}</button>
        </div>
      </div>
    </div>
  );
};

const SubmitTeamModal = ({ account, allPlayers = [], allTeams = [], onClose, onSave }) => {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [color, setColor] = useState(C.green);
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]); // usernames the creator picked (excludes owner)
  const [playerFilter, setPlayerFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const logoInputRef = useRef(null);

  // Map username → the team that already claims them (if any), so we can lock those rows
  const lockedTeamByUser = useMemo(() => {
    const map = {};
    (allTeams || []).forEach(t => {
      if (t.status === 'approved' || t.status === 'pending') {
        (t.members || []).forEach(u => { map[u.toLowerCase()] = t; });
        (t.pendingMembers || []).forEach(u => { map[u.toLowerCase()] = t; });
      }
    });
    return map;
  }, [allTeams]);

  // Filterable, alphabetized list of candidates (excludes the owner themselves)
  const candidatePlayers = useMemo(
    () => (allPlayers || [])
      .filter(p => p.username.toLowerCase() !== account.username.toLowerCase())
      .filter(p => !playerFilter || p.username.toLowerCase().includes(playerFilter.toLowerCase()))
      .sort((a, b) => a.username.localeCompare(b.username)),
    [allPlayers, account.username, playerFilter]
  );

  const toggleMember = (username) => {
    setError('');
    setSelectedMembers(prev => {
      if (prev.includes(username)) return prev.filter(u => u !== username);
      // 15-player cap: owner + 14 invitees. Warn but don't add if already at cap.
      if (prev.length >= 14) {
        setError('Roster cap is 15 (owner + 14 invitees). Deselect someone to swap.');
        return prev;
      }
      return [...prev, username];
    });
  };

  const handleLogoFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Team logo must be an image file'); return; }
    setError('');
    setLogoBusy(true);
    try {
      // logos are square-ish and small — 300px is plenty
      const dataUrl = await compressImage(file, 300, 0.85);
      setLogoUrl(dataUrl);
    } catch (e) {
      setError('Could not process logo: ' + (e?.message || e));
    }
    setLogoBusy(false);
  };

  const handleSubmit = async () => {
    setError('');
    if (!name.trim() || name.length < 3) { setError('Team name must be 3+ characters'); return; }
    if (!tag.trim() || tag.length < 2 || tag.length > 5) { setError('Tag must be 2-5 characters'); return; }
    if (!logoUrl) { setError('Please upload a team logo'); return; }
    if (checkUsernameProfanity(name) || checkUsernameProfanity(tag)) {
      setError('That team name or tag isn\'t allowed. Please choose something else.');
      return;
    }
    setLoading(true);
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const team = {
      id, name: name.trim(), tag: tag.trim().toUpperCase(),
      color, description: description.trim(),
      logoUrl,
      ownerUsername: account.username,
      // The team only starts with the owner. Picked players are stored as
      // pendingMembers — admin sees them during approval and decides who to add.
      members: [account.username],
      pendingMembers: selectedMembers,
      status: 'pending',
      createdAt: Date.now(),
      reviewedAt: null, reviewedBy: null, rejectionReason: null,
    };
    await db.saveTeam(team);
    setLoading(false);
    onSave(team);
    onClose();
  };

  const inputStyle = { background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream };
  const Lbl = ({ children }) => <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{children}</label>;

  return (
    <ModalShell onClose={onClose} title="SUBMIT TEAM" maxWidth="max-w-md">
      <div className="mb-4 px-3 py-2 rounded flex items-center gap-2" style={{
        background: `${C.gold}11`, border: `1px solid ${C.gold}44`,
      }}>
        <Clock size={14} style={{ color: C.goldLight }} />
        <span className="font-mono text-[10px] tracking-wider" style={{ color: C.goldLight }}>
          ADMINS WILL REVIEW YOUR TEAM SUBMISSION
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <Lbl>TEAM NAME</Lbl>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={32}
            placeholder="FC Lightning"
            className="w-full rounded px-3 py-2 font-body focus:outline-none"
            style={inputStyle}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Lbl>TAG (2-5)</Lbl>
            <input
              type="text" value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={5}
              placeholder="FCL"
              className="w-full rounded px-3 py-2 font-mono focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <Lbl>TEAM COLOR</Lbl>
            <input
              type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 rounded cursor-pointer"
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <Lbl>DESCRIPTION (OPTIONAL)</Lbl>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={3}
            placeholder="Tell admins about your squad..."
            className="w-full rounded px-3 py-2 font-body text-sm focus:outline-none"
            style={inputStyle}
          />
        </div>
        <div>
          <Lbl>TEAM LOGO (REQUIRED)</Lbl>
          <input
            ref={logoInputRef}
            type="file" accept="image/*"
            onChange={(e) => handleLogoFile(e.target.files?.[0])}
            className="hidden"
          />
          <div className="flex items-center gap-3">
            <div className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 56, height: 56, background: C.navyDeep, border: `1px solid ${C.navyLight}66`, overflow: 'hidden' }}>
              {logoUrl
                ? <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <Shield size={22} style={{ color: `${C.cream}44` }} />}
            </div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoBusy}
              className="px-3 py-2 rounded font-mono text-[11px] tracking-wider disabled:opacity-50"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}88`, color: C.cream }}
            >{logoBusy ? 'PROCESSING...' : logoUrl ? 'CHANGE LOGO' : 'UPLOAD LOGO'}</button>
          </div>
        </div>

        {/* ROSTER PICKER — creator invites players. Locked rows are on another
            team already. Selections are saved as pendingMembers; admin decides
            which get added to the real roster on approval. */}
        <div>
          <Lbl>INVITE PLAYERS (OPTIONAL · ADMIN APPROVES)</Lbl>
          <input
            type="text"
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            placeholder="Search players…"
            className="w-full px-3 py-2 mb-2 rounded font-body text-sm"
            style={inputStyle}
          />
          <div className="rounded-lg max-h-52 overflow-y-auto" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66` }}>
            {candidatePlayers.length === 0 ? (
              <div className="px-3 py-3 font-body text-xs" style={{ color: `${C.cream}66` }}>No other players to invite yet.</div>
            ) : (
              candidatePlayers.map(p => {
                const locked = lockedTeamByUser[p.username.toLowerCase()];
                const checked = selectedMembers.includes(p.username);
                return (
                  <button
                    key={p.username}
                    type="button"
                    disabled={!!locked}
                    onClick={() => toggleMember(p.username)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed"
                    style={{
                      borderBottom: `1px solid ${C.navyLight}33`,
                      background: checked ? `${C.green}22` : 'transparent',
                      opacity: locked ? 0.45 : 1,
                    }}
                  >
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{
                      border: `1.5px solid ${checked ? C.green : `${C.cream}55`}`,
                      background: checked ? C.green : 'transparent',
                    }}>
                      {checked && <Check size={11} style={{ color: C.onColor }} />}
                    </div>
                    <span className="font-heading tracking-wider text-sm flex-1" style={{ color: C.cream }}>
                      {p.username}
                    </span>
                    <span className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}66` }}>
                      {p.position}
                    </span>
                    {locked && (
                      <span className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded" style={{
                        background: `${C.red}22`, color: C.redLight,
                      }}>ON {locked.tag || 'A TEAM'}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {selectedMembers.length > 0 && (
            <div className="font-mono text-[10px] tracking-wider mt-1" style={{ color: C.greenLight }}>
              {selectedMembers.length} / 14 invited (admin approves · 15-player cap incl. you)
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded font-mono text-xs" style={{
            background: `${C.red}22`, border: `1px solid ${C.red}66`, color: C.redLight,
          }}>
            <XCircle size={12} /> {error}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 font-display tracking-[0.15em] text-xl disabled:opacity-50 rounded mt-1"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor,
            boxShadow: `0 4px 16px ${C.green}66, inset 0 1px 0 ${C.white}30`,
          }}
        >{loading ? 'SUBMITTING...' : 'SUBMIT FOR APPROVAL'}</button>
      </div>
    </ModalShell>
  );
};

// ============ POSITION BREAKDOWN ============
const Metric = ({ icon, label, value, accent = C.green }) => (
  <div className="rounded-lg px-3 py-2.5 transition-all hover:scale-[1.02]" style={{
    background: C.white,
    border: `1px solid ${accent}44`,
    boxShadow: `0 1px 3px ${C.brandNavy}11, 0 0 0 1px ${accent}11 inset`,
  }}>
    <div className="flex items-center gap-1.5 mb-1" style={{ color: accent }}>
      <span className="w-3.5 h-3.5 inline-flex items-center justify-center">{icon}</span>
      <span className="font-mono text-[9px] tracking-[0.2em]" style={{ opacity: 0.9 }}>{label}</span>
    </div>
    <div className="font-display text-2xl" style={{ color: C.cream }}>{value}</div>
  </div>
);

const PositionBreakdown = ({ account, season }) => {
  const stats = getStatsForSeason(account, season);
  const games = stats.games || 0;
  const isAttacker = account.position === 'ST';
  const isMidfielder = account.position === 'CM';
  const isDefender = account.position === 'DEF';
  const isGK = account.position === 'GK';
  const safeRate = (n, d) => d > 0 ? ((n/d)*100).toFixed(0) : '0';
  const safeAvg = (n, d) => d > 0 ? (n/d).toFixed(2) : '0.00';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={18} style={{ color: C.greenLight }} />
        <h4 className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>{account.position} BREAKDOWN</h4>
        {season !== 'all' && (
          <span className="font-mono text-[9px] px-2 py-0.5 rounded tracking-wider" style={{
            background: `${C.gold}22`, color: C.goldLight, border: `1px solid ${C.gold}44`,
          }}>{season}</span>
        )}
      </div>
      {games === 0 && <div className="font-mono text-sm py-4" style={{ color: `${C.cream}55` }}>No matches in this season yet.</div>}
      {games > 0 && isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Hand />} label="DEFLECTS / GAME" value={safeAvg(stats.deflects, games)} accent={C.greenLight} />
          <Metric icon={<Shield />} label="CLEAN SHEET %" value={`${safeRate(stats.cleanSheets, games)}%`} accent={C.greenLight} />
          <Metric icon={<Target />} label="CATCHES / GAME" value={safeAvg(stats.catches, games)} accent={C.greenLight} />
          <Metric icon={<Trophy />} label="TOTAL DEFLECTS" value={stats.deflects} accent={C.goldLight} />
        </div>
      )}
      {games > 0 && isAttacker && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Target />} label="GOALS / GAME" value={safeAvg(stats.goals, games)} accent={C.redLight} />
          <Metric icon={<Zap />} label="ASSISTS / GAME" value={safeAvg(stats.assists, games)} accent={C.greenLight} />
          <Metric icon={<TrendingUp />} label="G + A" value={stats.goals + stats.assists} accent={C.goldLight} />
          <Metric icon={<Activity />} label="PASSES / GAME" value={safeAvg(stats.passes * games, games)} accent={C.greenLight} />
        </div>
      )}
      {games > 0 && isMidfielder && !isAttacker && !isDefender && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Zap />} label="ASSISTS / GAME" value={safeAvg(stats.assists, games)} accent={C.greenLight} />
          <Metric icon={<TrendingUp />} label="PASSES / GAME" value={stats.passes} accent={C.greenLight} />
          <Metric icon={<Shield />} label="TACKLES / GAME" value={safeAvg(stats.tackles, games)} accent={C.redLight} />
          <Metric icon={<Target />} label="GOALS" value={stats.goals} accent={C.redLight} />
        </div>
      )}
      {games > 0 && isDefender && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Shield />} label="TACKLES / GAME" value={safeAvg(stats.tackles, games)} accent={C.redLight} />
          <Metric icon={<Trophy />} label="CLEAN SHEET %" value={`${safeRate(stats.cleanSheets, games)}%`} accent={C.greenLight} />
          <Metric icon={<Activity />} label="PASSES / GAME" value={stats.passes} accent={C.greenLight} />
          <Metric icon={<Target />} label="GOALS" value={stats.goals} accent={C.goldLight} />
        </div>
      )}
    </div>
  );
};

// ============ HEAD TO HEAD ============
const HeadToHead = ({ account }) => {
  const [opponent, setOpponent] = useState('');
  const opponents = useMemo(() => {
    const map = {};
    (account.matches || []).forEach(m => {
      const key = m.opponent || 'Unknown';
      if (!map[key]) map[key] = { opponent: key, games: 0, w: 0, d: 0, l: 0, goals: 0, assists: 0, motm: 0 };
      map[key].games += 1;
      map[key].goals += m.goals || 0;
      map[key].assists += m.assists || 0;
      if (m.motm) map[key].motm += 1;
      if (m.result === 'W') map[key].w += 1;
      else if (m.result === 'L') map[key].l += 1;
      else map[key].d += 1;
    });
    return Object.values(map).sort((a, b) => b.games - a.games);
  }, [account.matches]);

  const selected = opponents.find(o => o.opponent === opponent);
  const selectedMatches = (account.matches || []).filter(m => (m.opponent || 'Unknown') === opponent);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Swords size={22} style={{ color: C.redLight }} />
        <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>HEAD TO HEAD</h3>
      </div>
      {opponents.length === 0 ? (
        <EmptyState icon={<Swords size={40} />} text="Log matches to track your record vs each opponent" />
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {opponents.map(o => {
              const active = opponent === o.opponent;
              return (
                <button
                  key={o.opponent}
                  onClick={() => setOpponent(o.opponent)}
                  className="w-full text-left p-3 rounded-lg transition-all"
                  style={{
                    background: active ? `${C.green}22` : `${C.navyDeep}aa`,
                    border: `1px solid ${active ? C.green : C.navyLight}66`,
                  }}
                >
                  <div className="font-heading text-sm truncate tracking-wider" style={{ color: C.cream }}>{o.opponent.toUpperCase()}</div>
                  <div className="font-mono text-[10px] mt-0.5" style={{ color: `${C.cream}66` }}>
                    {o.games} GAMES • <span style={{ color: C.greenLight }}>{o.w}W</span>-<span style={{ color: C.goldLight }}>{o.d}D</span>-<span style={{ color: C.redLight }}>{o.l}L</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="md:col-span-2">
            {selected ? (
              <div className="space-y-3">
                <div className="rounded-xl p-4" style={{
                  background: C.white,
                  border: `1px solid ${C.navyLight}`,
                  boxShadow: `0 2px 8px ${C.brandNavy}11`,
                }}>
                  <div className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>{selected.opponent.toUpperCase()}</div>
                  <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: `${C.cream}66` }}>{selected.games} TOTAL MATCHES</div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <RecordBox value={selected.w} label="WINS" color={C.greenLight} />
                    <RecordBox value={selected.d} label="DRAWS" color={C.goldLight} />
                    <RecordBox value={selected.l} label="LOSSES" color={C.redLight} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <SmallStat value={selected.goals} label="GOALS" />
                    <SmallStat value={selected.assists} label="ASSISTS" />
                    <SmallStat value={selected.games} label="GAMES" />
                  </div>
                </div>
                <div>
                  <h4 className="font-display text-xl tracking-wider mb-2" style={{ color: C.cream }}>MATCH HISTORY</h4>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {selectedMatches.map((m, i) => (
                      <div key={m.id || i} className="rounded p-2 flex items-center gap-3 text-sm" style={{
                        background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}33`,
                      }}>
                        <ResultBadge result={m.result} small />
                        <div className="flex-1 font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
                          {new Date(m.date).toLocaleDateString()} • {m.season || 'S1'}
                        </div>
                        <div className="font-mono text-xs">
                          <span style={{ color: C.greenLight }}>{m.goals}</span>G{' '}
                          <span style={{ color: C.goldLight }}>{m.assists}</span>A
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl p-12 text-center font-mono text-sm" style={{
                background: `${C.navyDeep}66`,
                border: `1px dashed ${C.navyLight}66`,
                color: `${C.cream}55`,
              }}>SELECT AN OPPONENT TO VIEW DETAILS</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const RecordBox = ({ value, label, color }) => (
  <div className="rounded-lg p-2 text-center" style={{
    background: `${color}11`, border: `1px solid ${color}44`,
  }}>
    <div className="font-display text-3xl" style={{ color }}>{value}</div>
    <div className="font-mono text-[9px] tracking-widest" style={{ color: `${C.cream}77` }}>{label}</div>
  </div>
);

const SmallStat = ({ value, label }) => (
  <div className="rounded p-2 text-center" style={{ background: `${C.navyLight}33` }}>
    <div className="font-display text-2xl" style={{ color: C.cream }}>{value}</div>
    <div className="font-mono text-[9px] tracking-widest" style={{ color: `${C.cream}66` }}>{label}</div>
  </div>
);

const ResultBadge = ({ result, small }) => {
  const color = result === 'W' ? C.greenLight : result === 'L' ? C.redLight : C.goldLight;
  return (
    <div className={`rounded flex items-center justify-center font-display ${small ? 'w-7 h-7 text-base' : 'w-10 h-10 text-xl'}`} style={{
      background: `${color}22`, color, border: `1px solid ${color}66`,
    }}>{result}</div>
  );
};

const EmptyState = ({ icon, text }) => (
  <div className="text-center py-16 font-mono text-sm" style={{ color: `${C.cream}55` }}>
    <div className="flex justify-center mb-3" style={{ color: `${C.cream}33` }}>{icon}</div>
    {text}
  </div>
);

// ============ TEAM STANDINGS ============
// Reads all approved match submissions and computes a season standings table:
// W/D/L/GF/GA/GD/Pts, sorted by points then goal difference. Filterable by
// season via a dropdown.
const TeamStandings = ({ allTeams = [] }) => {
  const [submissions, setSubmissions] = useState([]);
  const [season, setSeason] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const subs = await db.listSubmissions();
        setSubmissions(subs.filter(s => s.status === 'approved'));
      } catch (e) {
        console.error('Failed to load submissions for standings:', e);
      }
      setLoading(false);
    })();
  }, []);

  // Build the list of seasons present in the data
  const seasons = useMemo(() => {
    const set = new Set();
    submissions.forEach(s => { if (s.matchInfo?.season) set.add(s.matchInfo.season); });
    return Array.from(set).sort();
  }, [submissions]);

  // Filter submissions by chosen season
  const filtered = useMemo(() => {
    if (season === 'all') return submissions;
    return submissions.filter(s => s.matchInfo?.season === season);
  }, [submissions, season]);

  // Aggregate stats per team
  const standings = useMemo(() => {
    const approvedTeams = allTeams.filter(t => t.status === 'approved');
    const table = {};
    approvedTeams.forEach(t => {
      table[t.id] = {
        team: t, played: 0, w: 0, d: 0, l: 0,
        gf: 0, ga: 0, gd: 0, pts: 0,
      };
    });
    filtered.forEach(sub => {
      const mi = sub.matchInfo || {};
      const homeId = mi.homeTeamId;
      const awayId = mi.awayTeamId;
      const hs = Number(mi.homeScore || 0);
      const as = Number(mi.awayScore || 0);
      if (!homeId || !awayId) return;
      // Skip matches involving deleted / non-approved teams
      if (!table[homeId] || !table[awayId]) return;
      const home = table[homeId];
      const away = table[awayId];
      home.played += 1; away.played += 1;
      home.gf += hs; home.ga += as;
      away.gf += as; away.ga += hs;
      if (hs > as) { home.w += 1; home.pts += 3; away.l += 1; }
      else if (hs < as) { away.w += 1; away.pts += 3; home.l += 1; }
      else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
    });
    Object.values(table).forEach(row => { row.gd = row.gf - row.ga; });
    // Sort by pts desc, gd desc, gf desc, team name asc
    return Object.values(table).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd  !== a.gd)  return b.gd  - a.gd;
      if (b.gf  !== a.gf)  return b.gf  - a.gf;
      return a.team.name.localeCompare(b.team.name);
    });
  }, [filtered, allTeams]);

  if (loading) {
    return <div className="text-center py-6 font-mono text-xs" style={{ color: `${C.cream}66` }}>LOADING STANDINGS…</div>;
  }

  const hasAnyMatches = submissions.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-lg tracking-wider" style={{ color: C.cream }}>STANDINGS</span>
        </div>
        {seasons.length > 0 && (
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded px-2 py-1 font-mono text-[11px] tracking-wider"
            style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66` }}
          >
            <option value="all">ALL SEASONS</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {!hasAnyMatches ? (
        <div className="text-center py-6 font-mono text-xs" style={{ color: `${C.cream}55` }}>
          NO APPROVED MATCHES YET
        </div>
      ) : (
        <div className="rounded-lg overflow-x-auto" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: `${C.brandNavy}dd` }}>
                <th className="text-left font-mono text-[10px] tracking-[0.15em] px-3 py-2" style={{ color: C.cream }}>#</th>
                <th className="text-left font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>TEAM</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>P</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>W</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>D</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>L</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>GF</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>GA</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>GD</th>
                <th className="text-right font-mono text-[10px] tracking-[0.15em] px-3 py-2" style={{ color: C.goldLight }}>PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, idx) => (
                <tr key={row.team.id} style={{
                  borderBottom: `1px solid ${C.navyLight}22`,
                  background: idx === 0 ? `${C.goldLight}11` : 'transparent',
                }}>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: C.brandNavy }}>{idx + 1}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {row.team.logoUrl && (
                        <img src={row.team.logoUrl} alt="" className="w-5 h-5 rounded shrink-0 object-cover" />
                      )}
                      <span className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>{row.team.name}</span>
                      <span className="font-mono text-[9px] px-1 rounded" style={{ background: `${row.team.color || C.navyLight}33`, color: `${C.brandNavy}88` }}>{row.team.tag}</span>
                    </div>
                  </td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.played}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.w}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.d}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.l}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.gf}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.ga}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: row.gd > 0 ? C.green : row.gd < 0 ? C.red : `${C.brandNavy}88` }}>
                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                  </td>
                  <td className="text-right px-3 py-2 font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============ TEAM ROSTER FORMATION ============
// Displays team members arranged in a 1-3-2-2 formation (8v8) with empty slots
// for missing positions. Extra players (beyond 8) appear under a BENCH section.
// FLEX players go on the bench too since they don't map to a formation slot.
// Clicking any player card opens the PlayerCardModal for full front + back view.
const TeamRosterFormation = ({ team, allPlayers = [], rankings, onCardClick }) => {
  // Fetch full account records for each roster member
  const members = useMemo(() => {
    return (team.members || [])
      .map(u => allPlayers.find(p => p.username.toLowerCase() === u.toLowerCase()))
      .filter(Boolean);
  }, [team.members, allPlayers]);

  // Bucket players by position for the formation slots
  const buckets = useMemo(() => {
    const b = { GK: [], DEF: [], CM: [], ST: [], FLEX: [] };
    members.forEach(p => {
      const pos = p.position || 'CM';
      if (b[pos]) b[pos].push(p);
      else b.CM.push(p);
    });
    // Sort each bucket by OVR desc so the strongest player takes the slot
    const sortByOvr = (a, b) => {
      const ra = rankings?.[a.username]?.overall || 0;
      const rb = rankings?.[b.username]?.overall || 0;
      return rb - ra;
    };
    Object.keys(b).forEach(pos => b[pos].sort(sortByOvr));
    return b;
  }, [members, rankings]);

  // Formation needs: 1 GK, 3 DEF, 2 CM, 2 ST
  const needs = { GK: 1, DEF: 3, CM: 2, ST: 2 };

  // Starters (formation slots) — take up to N per position
  const starters = {
    GK:  buckets.GK.slice(0, needs.GK),
    DEF: buckets.DEF.slice(0, needs.DEF),
    CM:  buckets.CM.slice(0, needs.CM),
    ST:  buckets.ST.slice(0, needs.ST),
  };
  // Bench = anyone left over (extras per position + all FLEX)
  const bench = [
    ...buckets.GK.slice(needs.GK),
    ...buckets.DEF.slice(needs.DEF),
    ...buckets.CM.slice(needs.CM),
    ...buckets.ST.slice(needs.ST),
    ...buckets.FLEX,
  ];

  // A single slot in the formation — shows either a player card or an empty placeholder
  const Slot = ({ player, positionLabel }) => (
    <div className="flex flex-col items-center">
      {player ? (
        <button
          type="button"
          onClick={() => onCardClick && onCardClick(player)}
          className="transition-transform hover:scale-105 focus:outline-none"
          style={{ cursor: 'pointer' }}
        >
          <PlayerCard account={player} size="sm" team={team} rankings={rankings} hideTeam={true} />
        </button>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded"
          style={{
            width: 175, height: 280,
            background: `${C.navyDeep}88`,
            border: `2px dashed ${C.navyLight}66`,
            color: `${C.cream}55`,
          }}
        >
          <div className="font-display text-3xl tracking-wider">{positionLabel}</div>
          <div className="font-mono text-[10px] tracking-widest mt-1">EMPTY</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* FORMATION — pitch layout, attackers at top, keeper at bottom */}
      <div
        className="rounded-xl p-4 sm:p-6"
        style={{
          background: `linear-gradient(180deg, #1a5a2a 0%, #24713a 100%)`,
          border: `2px solid ${C.brandNavyDeep}`,
          boxShadow: `inset 0 0 40px rgba(0,0,0,0.35)`,
        }}
      >
        {/* Subtle pitch lines */}
        <div className="relative">
          <div className="absolute inset-0 pointer-events-none opacity-30" style={{
            backgroundImage: `
              linear-gradient(90deg, transparent 49%, rgba(255,255,255,0.4) 49%, rgba(255,255,255,0.4) 51%, transparent 51%),
              linear-gradient(180deg, transparent 49%, rgba(255,255,255,0.2) 49%, rgba(255,255,255,0.2) 51%, transparent 51%)
            `,
          }} />
          {/* Row 1: STs */}
          <div className="flex justify-center gap-3 sm:gap-6 relative">
            {[0, 1].map(i => <Slot key={`st${i}`} player={starters.ST[i]} positionLabel="ST" />)}
          </div>
          {/* Row 2: CMs */}
          <div className="flex justify-center gap-3 sm:gap-6 mt-3 sm:mt-6 relative">
            {[0, 1].map(i => <Slot key={`cm${i}`} player={starters.CM[i]} positionLabel="CM" />)}
          </div>
          {/* Row 3: DEFs (3) */}
          <div className="flex justify-center gap-3 sm:gap-6 mt-3 sm:mt-6 relative flex-wrap">
            {[0, 1, 2].map(i => <Slot key={`def${i}`} player={starters.DEF[i]} positionLabel="DEF" />)}
          </div>
          {/* Row 4: GK */}
          <div className="flex justify-center mt-3 sm:mt-6 relative">
            <Slot player={starters.GK[0]} positionLabel="GK" />
          </div>
        </div>
      </div>

      {/* BENCH — extras + FLEX players */}
      {bench.length > 0 && (
        <div>
          <h4 className="font-display text-lg tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
            <Users size={14} /> BENCH ({bench.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {bench.map(p => (
              <button
                key={p.username}
                type="button"
                onClick={() => onCardClick && onCardClick(p)}
                className="flex justify-center transition-transform hover:scale-105 focus:outline-none"
                style={{ cursor: 'pointer' }}
              >
                <PlayerCard account={p} size="sm" team={team} rankings={rankings} hideTeam={true} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============ PLAYER CARD MODAL ============
// Opens a full-size player card on top of the page with front/back both visible.
// Click either card face to flip that face inline, or the X to close.
const PlayerCardModal = ({ player, team, rankings, onClose }) => {
  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full transition-transform hover:scale-110"
        style={{ background: `${C.white}22`, color: '#fff' }}
        aria-label="Close"
      >
        <X size={22} />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl w-full max-h-full overflow-y-auto py-8 px-2"
      >
        <div className="flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-10">
          <div className="text-center">
            <div className="font-mono text-[10px] tracking-[0.3em] mb-2" style={{ color: `${C.white}88` }}>FRONT · TAP TO FLIP</div>
            <PlayerCard account={player} size="lg" team={team} rankings={rankings} />
          </div>
        </div>
        <div className="text-center mt-4 font-mono text-[10px] tracking-widest" style={{ color: `${C.white}66` }}>
          TAP OUTSIDE OR ✕ TO CLOSE
        </div>
      </div>
    </div>
  );
};

// ============ TEAMS VIEW ============
const TeamsView = ({ account, onUpdate, rankings }) => {
  const [teams, setTeams] = useState([]);
  const [showSubmit, setShowSubmit] = useState(false);
  const [selected, setSelected] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [viewingPlayerCard, setViewingPlayerCard] = useState(null);

  const refresh = async () => {
    setTeams(await db.listTeams());
    setAllPlayers(await db.listAccounts());
  };
  useEffect(() => { refresh(); }, []);

  const approved = teams.filter(t => t.status === 'approved');
  const myTeam = teams.find(t => t.id === account.teamId && t.status === 'approved');
  const myPending = teams.find(t => t.ownerUsername === account.username && t.status === 'pending');
  const myRejected = teams.find(t => t.ownerUsername === account.username && t.status === 'rejected');

  const joinTeam = async (team) => {
    if (team.members.includes(account.username)) return;
    const updatedTeam = { ...team, members: [...team.members, account.username] };
    await db.saveTeam(updatedTeam);
    const updatedAccount = { ...account, teamId: team.id };
    await db.saveAccount(updatedAccount);
    onUpdate(updatedAccount);
    refresh();
  };

  const leaveTeam = async (team) => {
    const updatedTeam = { ...team, members: team.members.filter(m => m !== account.username) };
    await db.saveTeam(updatedTeam);
    const updatedAccount = { ...account, teamId: null };
    await db.saveAccount(updatedAccount);
    onUpdate(updatedAccount);
    refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={22} style={{ color: C.greenLight }} />
          <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>TEAMS</h3>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded tracking-wider" style={{
            background: `${C.navyLight}33`, color: `${C.cream}88`,
          }}>{approved.length}</span>
        </div>
        {!myPending && !myTeam && (
          <button
            onClick={() => setShowSubmit(true)}
            className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 2px 8px ${C.green}66`,
            }}
          ><Plus size={14} /> SUBMIT TEAM</button>
        )}
      </div>

      {/* SEASON STANDINGS — computed from approved match submissions */}
      <div className="mb-6">
        <TeamStandings allTeams={teams} />
      </div>

      {myPending && (
        <div className="mb-4 rounded-lg p-4 flex items-center gap-3" style={{
          background: `${C.gold}11`, border: `1px solid ${C.gold}44`,
        }}>
          <Clock style={{ color: C.goldLight }} />
          <div className="flex-1">
            <div className="font-display text-xl tracking-wider" style={{ color: C.cream }}>
              {myPending.name.toUpperCase()} <span className="font-mono text-xs" style={{ color: C.goldLight }}>[PENDING REVIEW]</span>
            </div>
            <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.cream}77` }}>AWAITING ADMIN APPROVAL</div>
          </div>
        </div>
      )}
      {myRejected && !myPending && !myTeam && (
        <div className="mb-4 rounded-lg p-4" style={{
          background: `${C.red}11`, border: `1px solid ${C.red}44`,
        }}>
          <div className="flex items-center gap-3 mb-2">
            <XCircle style={{ color: C.redLight }} />
            <div className="font-display text-xl tracking-wider" style={{ color: C.cream }}>
              {myRejected.name.toUpperCase()} <span className="font-mono text-xs" style={{ color: C.redLight }}>[REJECTED]</span>
            </div>
          </div>
          {myRejected.rejectionReason && (
            <div className="font-mono text-xs ml-9 mb-2" style={{ color: `${C.cream}77` }}>REASON: {myRejected.rejectionReason}</div>
          )}
          <button
            onClick={async () => { await db.deleteTeam(myRejected.id); refresh(); }}
            className="ml-9 text-xs font-mono underline tracking-wider"
            style={{ color: `${C.cream}77` }}
          >DISMISS & RESUBMIT</button>
        </div>
      )}

      {approved.length === 0 ? (
        <EmptyState icon={<Users size={40} />} text="No approved teams yet. Be the first to submit." />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {approved.map(t => {
            const tColor = t.color || C.green;
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="text-left rounded-xl p-4 transition-all hover:scale-[1.02]"
                style={{
                  background: C.white,
                  border: `1px solid ${C.navyLight}`,
                  borderTop: `3px solid ${tColor}`,
                  boxShadow: `0 2px 8px ${C.brandNavy}11`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>{t.name.toUpperCase()}</div>
                  <div className="font-heading text-xs px-2 py-0.5 rounded tracking-widest" style={{
                    background: tColor, color: C.onColor,
                  }}>{t.tag}</div>
                </div>
                {t.description && (
                  <div className="font-body text-sm mb-3 line-clamp-2" style={{ color: `${C.cream}99` }}>{t.description}</div>
                )}
                <div className="flex items-center justify-between font-mono text-[10px] tracking-wider" style={{ color: `${C.cream}66` }}>
                  <span>{t.members.length} {t.members.length === 1 ? 'MEMBER' : 'MEMBERS'}</span>
                  <span className="flex items-center gap-1"><Crown size={10} style={{ color: C.goldLight }} /> {t.ownerUsername}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showSubmit && <SubmitTeamModal account={account} allPlayers={allPlayers} allTeams={teams} onClose={() => setShowSubmit(false)} onSave={refresh} />}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{
          background: `${C.black}cc`, backdropFilter: 'blur(8px)',
        }} onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full my-8 rounded-xl p-6 fade-in" style={{
            background: C.white,
            border: `2px solid ${selected.color || C.green}`,
            boxShadow: `0 20px 60px ${C.brandNavy}44, 0 0 60px ${selected.color || C.green}33`,
          }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="font-display text-4xl tracking-wider" style={{ color: C.cream }}>{selected.name.toUpperCase()}</div>
                  <div className="font-heading text-sm px-2 py-1 rounded tracking-widest" style={{
                    background: selected.color || C.green, color: C.onColor,
                  }}>{selected.tag}</div>
                </div>
                <div className="font-mono text-[10px] tracking-widest flex items-center gap-1" style={{ color: `${C.cream}66` }}>
                  <Crown size={10} style={{ color: C.goldLight }} /> FOUNDED BY {selected.ownerUsername.toUpperCase()}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded" style={{
                background: `${C.navyLight}44`, color: C.cream,
              }}><X size={18} /></button>
            </div>

            {selected.description && (
              <p className="font-body mb-4" style={{ color: `${C.cream}cc` }}>{selected.description}</p>
            )}

            <div className="mb-4 flex gap-2">
              {selected.members.includes(account.username) && selected.ownerUsername !== account.username && (
                <button onClick={() => leaveTeam(selected)} className="px-4 py-2 font-heading tracking-wider text-xs rounded" style={{
                  background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66`,
                }}>LEAVE TEAM</button>
              )}
            </div>

            <h4 className="font-display text-xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
              <Users size={16} /> ROSTER ({selected.members.length})
            </h4>
            <TeamRosterFormation
              team={selected}
              allPlayers={allPlayers}
              rankings={rankings}
              onCardClick={(player) => setViewingPlayerCard(player)}
            />
          </div>
        </div>
      )}

      {viewingPlayerCard && (
        <PlayerCardModal
          player={viewingPlayerCard}
          team={selected}
          rankings={rankings}
          onClose={() => setViewingPlayerCard(null)}
        />
      )}
    </div>
  );
};

// ============ IMPORT MATCH MANAGER ============
// Admin uploads a Strikers Club JSON match export. The app parses it, previews
// each player with a dropdown to confirm the ASL account, and on confirm adds
// the match to each mapped player's record.
//
// Auto-matching: if an ASL account has `strikersId` set, players in the file
// with matching player_id are auto-mapped. Otherwise admin picks manually.
// After a manual pick, that Strikers Player ID gets saved onto the ASL account
// so future imports match automatically ("teach once, applies forever").
//
// Dedup: match_id from the file is stored on each match record. Uploading the
// same file twice is a no-op (players who already have that match_id are skipped).
//
// Unmatched players (no ASL account exists yet): logged but skipped. If the
// player later signs up, admin can retroactively add these stats from the
// Skipped Log tab.
const ImportMatchManager = ({ account, allPlayers, allTeams, currentSeason, onRefresh }) => {
  const [step, setStep] = useState(1); // 1=upload, 2=teams, 3=map, 4=confirm
  const [matchData, setMatchData] = useState(null); // parsed JSON
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  // For each strikers player_id → ASL username picked (or '' for skip)
  const [playerMap, setPlayerMap] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState(null); // shown on success screen
  const fileInputRef = useRef(null);

  // Approved teams only
  const approvedTeams = useMemo(
    () => (allTeams || []).filter(t => t.status === 'approved'),
    [allTeams]
  );

  // Build lookup: strikersId → ASL account
  const aslByStrikersId = useMemo(() => {
    const map = {};
    (allPlayers || []).forEach(p => {
      if (p.strikersId) map[String(p.strikersId)] = p;
    });
    return map;
  }, [allPlayers]);

  // ---------- STEP 1: parse uploaded file ----------
  const handleFile = async (file) => {
    setError('');
    if (!file) return;
    setBusy(true);
    try {
      let text;
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // Detect UTF-16 (Strikers Club exports are UTF-16 LE with BOM)
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        text = new TextDecoder('utf-16le').decode(bytes.slice(2));
      } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        text = new TextDecoder('utf-16be').decode(bytes.slice(2));
      } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        text = new TextDecoder('utf-8').decode(bytes.slice(3));
      } else {
        text = new TextDecoder('utf-8').decode(bytes);
      }
      const data = JSON.parse(text);
      if (!data.match_id || !Array.isArray(data.players)) {
        throw new Error('File does not look like a Strikers Club match export (missing match_id or players).');
      }
      setMatchData(data);
      // Pre-fill player map: auto-match by strikersId when possible
      const initialMap = {};
      for (const p of data.players) {
        const asl = aslByStrikersId[String(p.player_id)];
        initialMap[p.player_id] = asl ? asl.username : '';
      }
      setPlayerMap(initialMap);
      setStep(2);
    } catch (e) {
      setError('Could not parse file: ' + (e?.message || e));
    }
    setBusy(false);
  };

  // ---------- STEP 4: commit the import ----------
  const commit = async () => {
    setError('');
    if (!matchData) return;
    if (!homeTeamId || !awayTeamId) { setError('Pick both home and away teams first.'); return; }
    if (homeTeamId === awayTeamId) { setError('Home and away must be different teams.'); return; }
    setBusy(true);
    try {
      const homeTeam = approvedTeams.find(t => t.id === homeTeamId);
      const awayTeam = approvedTeams.find(t => t.id === awayTeamId);
      const homeScore = matchData.score?.home ?? 0;
      const awayScore = matchData.score?.away ?? 0;
      const isDraw = homeScore === awayScore;

      let updated = 0, skipped = 0, alreadyImported = 0;
      const skippedList = []; // {strikers_name, player_id, reason}

      for (const p of matchData.players) {
        const aslUsername = playerMap[p.player_id];
        if (!aslUsername) {
          skipped++;
          skippedList.push({ strikersName: p.username, playerId: p.player_id, reason: 'No ASL account' });
          continue;
        }
        const player = (allPlayers || []).find(x => x.username === aslUsername);
        if (!player) {
          skipped++;
          skippedList.push({ strikersName: p.username, playerId: p.player_id, reason: 'ASL account not found' });
          continue;
        }

        // Dedup: skip if this match_id already recorded for this player
        const already = (player.matches || []).some(m => m.strikersMatchId === matchData.match_id);
        if (already) { alreadyImported++; continue; }

        // Map Strikers stats → ASL stats
        const s = p.stats || {};
        const isHome = p.team === 'home';
        const goalsFor = isHome ? homeScore : awayScore;
        const goalsAgainst = isHome ? awayScore : homeScore;
        const opponent = isHome ? awayTeam : homeTeam;
        const ownTeam = isHome ? homeTeam : awayTeam;
        const result = goalsFor > goalsAgainst ? 'W' : (goalsFor < goalsAgainst ? 'L' : 'D');
        // Tackles = poke_tackles_won + slide_tackles_performed (Q1 = B)
        const tackles = (s.poke_tackles_won || 0) + (s.slide_tackles_performed || 0);
        // Clean sheet: derived. If your team allowed 0, it's a clean sheet for
        // the whole defense. We apply it to every player on the shutout team.
        const cleanSheet = goalsAgainst === 0;

        const matchRecord = {
          id: `sc_${matchData.match_id}_${p.player_id}`,
          strikersMatchId: matchData.match_id, // dedup key
          date: Date.now(),
          season: currentSeason,
          opponent: opponent?.name || (isHome ? 'AWAY' : 'HOME'),
          opponentTeamId: opponent?.id || null,
          ownTeamId: ownTeam?.id || null,
          result,
          goalsFor,
          goalsAgainst,
          stadium: matchData.stadium || '',
          matchLength: matchData.match_length || 0,
          goals: s.goals || 0,
          assists: s.assists || 0,
          passes: s.passes || 0,
          tackles,
          deflects: s.deflects || 0,
          catches: s.catches || 0,
          cleanSheet,
          motm: false,
          source: 'strikers-club-import',
        };

        // Aggregate lifetime totals for this player. We recompute from
        // matches[] to keep everything in sync (safer than incrementing).
        const updatedMatches = [...(player.matches || []), matchRecord];
        const lifetime = emptyStats();
        let totalPasses = 0;
        for (const m of updatedMatches) {
          lifetime.games += 1;
          lifetime.goals += m.goals || 0;
          lifetime.assists += m.assists || 0;
          lifetime.tackles += m.tackles || 0;
          lifetime.deflects += m.deflects || 0;
          lifetime.catches += m.catches || 0;
          if (m.cleanSheet) lifetime.cleanSheets += 1;
          if (m.motm) lifetime.motm += 1;
          if (m.result === 'W') lifetime.wins += 1;
          else if (m.result === 'L') lifetime.losses += 1;
          else lifetime.draws += 1;
          totalPasses += m.passes || 0;
        }
        if (lifetime.games > 0) lifetime.passes = Math.round(totalPasses / lifetime.games);

        // Persist strikersId if the player didn't have one yet (teach once)
        const patch = { ...player, matches: updatedMatches, stats: lifetime };
        if (!player.strikersId) patch.strikersId = String(p.player_id);
        await db.saveAccount(patch);
        updated++;
      }

      setImportResult({
        matchId: matchData.match_id,
        updated,
        skipped,
        alreadyImported,
        skippedList,
        homeTeam: homeTeam?.name,
        awayTeam: awayTeam?.name,
        score: `${homeScore} - ${awayScore}`,
      });
      setStep(5); // success screen
      if (onRefresh) onRefresh();
    } catch (e) {
      setError('Import failed: ' + (e?.message || e));
    }
    setBusy(false);
  };

  // Reset for another import
  const startOver = () => {
    setStep(1);
    setMatchData(null);
    setHomeTeamId('');
    setAwayTeamId('');
    setPlayerMap({});
    setImportResult(null);
    setError('');
  };

  // ---------- RENDER HELPERS ----------
  const StepBadge = ({ n, label, active, done }) => (
    <div className="flex-1 text-center px-2 py-1.5 rounded flex items-center justify-center gap-1.5" style={{
      background: active ? `${C.goldLight}22` : done ? `${C.green}22` : 'transparent',
      border: `1px solid ${active ? C.goldLight : done ? C.green : C.navyLight}44`,
    }}>
      <span className="font-mono text-[10px] tracking-wider" style={{
        color: active ? C.goldLight : done ? C.greenLight : `${C.cream}55`,
      }}>
        {done ? '✓' : n}. {label}
      </span>
    </div>
  );

  const H = ({ children }) => (
    <div className="font-heading tracking-wider text-xs mb-2" style={{ color: C.goldLight, letterSpacing: '0.2em' }}>{children}</div>
  );

  return (
    <div className="space-y-4">
      {/* Header + step tracker */}
      <div className="flex items-center gap-2 flex-wrap">
        <StepBadge n={1} label="UPLOAD"  active={step === 1} done={step > 1} />
        <StepBadge n={2} label="TEAMS"   active={step === 2} done={step > 2} />
        <StepBadge n={3} label="MAP"     active={step === 3} done={step > 3} />
        <StepBadge n={4} label="CONFIRM" active={step === 4} done={step > 4} />
      </div>

      {error && (
        <div className="p-3 rounded font-mono text-xs" style={{ background: `${C.red}22`, color: C.redLight, border: `1px solid ${C.red}44` }}>
          {error}
        </div>
      )}

      {/* ---------- STEP 1: UPLOAD ---------- */}
      {step === 1 && (
        <div className="p-6 rounded-lg text-center" style={{
          background: `${C.goldLight}08`,
          border: `2px dashed ${C.goldLight}55`,
        }}>
          <div className="text-4xl mb-3" style={{ color: C.goldLight }}>⬆</div>
          <div className="font-heading tracking-wider text-lg mb-1" style={{ color: C.goldLight }}>UPLOAD STRIKERS CLUB MATCH FILE</div>
          <div className="font-mono text-xs mb-4" style={{ color: `${C.cream}77` }}>
            .JSON export from Strikers Club (UTF-16 or UTF-8)
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
          <button
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 rounded font-heading tracking-wider text-sm"
            style={{
              background: C.goldLight, color: C.navyDeep,
              border: `1px solid ${C.gold}`,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >{busy ? 'PARSING…' : 'CHOOSE FILE'}</button>
        </div>
      )}

      {/* ---------- STEP 2: MATCH INFO + TEAMS ---------- */}
      {step === 2 && matchData && (
        <>
          <div className="p-4 rounded" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
            <H>MATCH INFO FROM FILE</H>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>MATCH ID</div>
                <div className="font-mono text-[10px] break-all" style={{ color: C.cream }}>{matchData.match_id.slice(0, 12)}…</div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>STADIUM</div>
                <div className="font-heading text-sm tracking-wider" style={{ color: C.cream }}>{matchData.stadium || '—'}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>LENGTH</div>
                <div className="font-heading text-sm tracking-wider" style={{ color: C.cream }}>{Math.floor((matchData.match_length || 0) / 60)}:00</div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>SCORE</div>
                <div className="font-heading text-lg tracking-wider" style={{ color: C.goldLight }}>
                  {matchData.score?.home ?? 0} - {matchData.score?.away ?? 0}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded" style={{ background: `${C.brandNavy}15`, border: `1px solid ${C.brandNavy}44` }}>
            <H>ASSIGN ASL TEAMS</H>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="font-mono text-[9px] tracking-wider mb-1" style={{ color: `${C.cream}77` }}>HOME (SCORE {matchData.score?.home ?? 0})</div>
                <select
                  value={homeTeamId}
                  onChange={(e) => setHomeTeamId(e.target.value)}
                  className="w-full px-3 py-2 rounded font-heading text-sm"
                  style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66` }}
                >
                  <option value="">— pick team —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>)}
                </select>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-wider mb-1" style={{ color: `${C.cream}77` }}>AWAY (SCORE {matchData.score?.away ?? 0})</div>
                <select
                  value={awayTeamId}
                  onChange={(e) => setAwayTeamId(e.target.value)}
                  className="w-full px-3 py-2 rounded font-heading text-sm"
                  style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66` }}
                >
                  <option value="">— pick team —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>)}
                </select>
              </div>
            </div>
            {approvedTeams.length < 2 && (
              <div className="mt-2 font-mono text-[10px]" style={{ color: C.redLight }}>
                You need at least 2 approved teams to import a match.
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={startOver} className="px-4 py-2 rounded font-heading text-xs tracking-wider" style={{ background: `${C.navyLight}33`, color: `${C.cream}88` }}>← BACK</button>
            <button
              onClick={() => setStep(3)}
              disabled={!homeTeamId || !awayTeamId}
              className="flex-1 px-4 py-2 rounded font-heading text-xs tracking-wider"
              style={{
                background: (homeTeamId && awayTeamId) ? C.goldLight : `${C.navyLight}22`,
                color: (homeTeamId && awayTeamId) ? C.navyDeep : `${C.cream}44`,
                cursor: (homeTeamId && awayTeamId) ? 'pointer' : 'not-allowed',
              }}
            >NEXT: MAP PLAYERS →</button>
          </div>
        </>
      )}

      {/* ---------- STEP 3: MAP PLAYERS ---------- */}
      {step === 3 && matchData && (
        <>
          <div className="p-4 rounded" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
            <H>MAP STRIKERS CLUB PLAYERS → ASL ACCOUNTS</H>
            <div className="font-mono text-[10px] mb-3" style={{ color: `${C.cream}77` }}>
              Auto-matched by Strikers Player ID when linked. Manually pick for anyone unmatched. Players with no ASL account will be skipped.
            </div>

            <div className="space-y-2">
              {matchData.players.map(p => {
                const teamBadge = p.team === 'home' ? 'HOME' : 'AWAY';
                const teamBadgeColor = p.team === 'home' ? C.brandNavy : C.red;
                const currentPick = playerMap[p.player_id] || '';
                const autoMatched = aslByStrikersId[String(p.player_id)];
                const isAuto = autoMatched && currentPick === autoMatched.username;
                const s = p.stats || {};
                const summary = [
                  s.goals ? `${s.goals}G` : null,
                  s.assists ? `${s.assists}A` : null,
                  s.passes ? `${s.passes}p` : null,
                  ((s.poke_tackles_won || 0) + (s.slide_tackles_performed || 0)) > 0 ? `${(s.poke_tackles_won || 0) + (s.slide_tackles_performed || 0)}T` : null,
                  s.deflects ? `${s.deflects}D` : null,
                  s.catches ? `${s.catches}C` : null,
                ].filter(Boolean).join(' · ') || 'no stats';

                return (
                  <div key={p.player_id} className="p-2 rounded flex items-center gap-2 flex-wrap sm:flex-nowrap" style={{
                    background: currentPick ? `${C.green}11` : `${C.red}11`,
                    border: `1px solid ${currentPick ? C.green : C.red}33`,
                  }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-sm tracking-wider truncate" style={{ color: C.cream }}>{p.username}</div>
                      <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>ID: {p.player_id}</div>
                    </div>
                    <div className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded" style={{
                      background: `${teamBadgeColor}33`, color: teamBadgeColor === C.red ? C.redLight : `${C.brandNavy}`,
                    }}>{teamBadge}</div>
                    <div className="font-mono text-[9px] hidden sm:block" style={{ color: `${C.cream}66` }}>{summary}</div>
                    <select
                      value={currentPick}
                      onChange={(e) => setPlayerMap(m => ({ ...m, [p.player_id]: e.target.value }))}
                      className="px-2 py-1.5 rounded font-heading text-xs w-full sm:w-52"
                      style={{
                        background: C.navyDeep,
                        color: currentPick ? C.cream : `${C.cream}55`,
                        border: `1px solid ${isAuto ? C.green : currentPick ? C.navyLight : C.red}66`,
                      }}
                    >
                      <option value="">— skip (no ASL account) —</option>
                      {(allPlayers || []).map(a => (
                        <option key={a.username} value={a.username}>{a.username}</option>
                      ))}
                    </select>
                    {isAuto && <span className="font-mono text-[9px] tracking-wider" style={{ color: C.greenLight }}>AUTO</span>}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
              <b style={{ color: C.greenLight }}>{Object.values(playerMap).filter(Boolean).length}</b> matched · <b style={{ color: C.redLight }}>{Object.values(playerMap).filter(v => !v).length}</b> will be skipped
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="px-4 py-2 rounded font-heading text-xs tracking-wider" style={{ background: `${C.navyLight}33`, color: `${C.cream}88` }}>← BACK</button>
            <button
              onClick={() => setStep(4)}
              className="flex-1 px-4 py-2 rounded font-heading text-xs tracking-wider"
              style={{ background: C.goldLight, color: C.navyDeep }}
            >NEXT: CONFIRM →</button>
          </div>
        </>
      )}

      {/* ---------- STEP 4: CONFIRM ---------- */}
      {step === 4 && matchData && (
        <>
          <div className="p-4 rounded" style={{ background: `${C.goldLight}11`, border: `1px solid ${C.goldLight}44` }}>
            <H>REVIEW & CONFIRM</H>
            <div className="font-mono text-xs space-y-1" style={{ color: C.cream }}>
              <div><b style={{ color: C.goldLight }}>Match:</b> {approvedTeams.find(t => t.id === homeTeamId)?.name} <b>{matchData.score?.home ?? 0} - {matchData.score?.away ?? 0}</b> {approvedTeams.find(t => t.id === awayTeamId)?.name}</div>
              <div><b style={{ color: C.goldLight }}>Season:</b> {currentSeason}</div>
              <div><b style={{ color: C.goldLight }}>Stadium:</b> {matchData.stadium || '—'}</div>
              <div><b style={{ color: C.goldLight }}>Will update:</b> {Object.values(playerMap).filter(Boolean).length} players</div>
              <div><b style={{ color: C.goldLight }}>Will skip:</b> {Object.values(playerMap).filter(v => !v).length} players (no ASL account)</div>
            </div>
            <div className="mt-3 font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
              Stats will be added to each matched player's record. Uploading the same match again is a no-op (deduped by match_id).
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(3)} className="px-4 py-2 rounded font-heading text-xs tracking-wider" style={{ background: `${C.navyLight}33`, color: `${C.cream}88` }}>← BACK</button>
            <button
              onClick={commit}
              disabled={busy}
              className="flex-1 px-4 py-2 rounded font-heading text-xs tracking-wider"
              style={{
                background: C.greenLight, color: C.onColor,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >{busy ? 'IMPORTING…' : `✓ CONFIRM IMPORT (${Object.values(playerMap).filter(Boolean).length} PLAYERS)`}</button>
          </div>
        </>
      )}

      {/* ---------- STEP 5: SUCCESS ---------- */}
      {step === 5 && importResult && (
        <div className="p-4 rounded" style={{ background: `${C.green}15`, border: `1px solid ${C.green}44` }}>
          <div className="font-heading tracking-wider text-lg mb-2" style={{ color: C.greenLight }}>✓ IMPORT COMPLETE</div>
          <div className="font-mono text-xs space-y-1 mb-3" style={{ color: C.cream }}>
            <div><b>{importResult.homeTeam}</b> {importResult.score} <b>{importResult.awayTeam}</b></div>
            <div>Updated: <b style={{ color: C.greenLight }}>{importResult.updated}</b> players</div>
            {importResult.alreadyImported > 0 && (
              <div>Already had this match: <b style={{ color: C.goldLight }}>{importResult.alreadyImported}</b></div>
            )}
            {importResult.skipped > 0 && (
              <div>Skipped: <b style={{ color: C.redLight }}>{importResult.skipped}</b> players (no ASL account)</div>
            )}
          </div>
          {importResult.skippedList.length > 0 && (
            <div className="mt-2 p-2 rounded" style={{ background: `${C.red}11`, border: `1px dashed ${C.red}44` }}>
              <div className="font-mono text-[10px] tracking-wider mb-1" style={{ color: C.redLight }}>SKIPPED PLAYERS (need ASL account):</div>
              <div className="font-mono text-[10px] space-y-0.5" style={{ color: `${C.cream}88` }}>
                {importResult.skippedList.map(s => (
                  <div key={s.playerId}>· {s.strikersName} (id {s.playerId}) — {s.reason}</div>
                ))}
              </div>
            </div>
          )}
          <button onClick={startOver} className="mt-3 px-4 py-2 rounded font-heading text-xs tracking-wider" style={{ background: C.goldLight, color: C.navyDeep }}>
            IMPORT ANOTHER MATCH
          </button>
        </div>
      )}
    </div>
  );
};

// ============ ADMIN PANEL ============
const AdminPanel = ({ account, dynamicAdmins, onRefreshAdmins }) => {
  const [section, setSection] = useState('stats');
  const [teams, setTeams] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [tab, setTab] = useState('pending');
  const [seasonInput, setSeasonInput] = useState('');
  const [currentSeason, setCurrentSeason] = useState('S1');
  const [editingTeam, setEditingTeam] = useState(null);
  const allTeams = teams; // alias for clarity

  const refresh = async () => {
    const t = await db.listTeams();
    setTeams(t.sort((a, b) => b.createdAt - a.createdAt));
    setAllPlayers(await db.listAccounts());
    const s = await db.getSeason();
    setCurrentSeason(s);
    setSeasonInput(s);
    // Also refresh the parent Dashboard so changes (approved pictures, renames,
    // edited stats, new champions, etc.) propagate to the leaderboard / my card
    // / teams / hall-of-fame views without needing a page reload.
    if (onRefreshAdmins) onRefreshAdmins();
  };
  useEffect(() => { refresh(); }, []);

  const approve = async (team) => {
    // Pull in players the creator invited (pendingMembers), but only ones who
    // are still free agents — skip anyone who joined another team in the
    // meantime. Roster capped at 15 players total (defensive: cap should already
    // be enforced at submission time, but this guards against any manual edits).
    const ROSTER_CAP = 15;
    const invited = team.pendingMembers || [];
    const finalMembers = [...new Set(team.members || [team.ownerUsername])];
    for (const username of invited) {
      if (finalMembers.length >= ROSTER_CAP) break;
      const player = await db.getAccount(username);
      if (player && !player.teamId) {
        if (!finalMembers.includes(player.username)) finalMembers.push(player.username);
        await db.saveAccount({ ...player, teamId: team.id });
      }
    }
    // Make sure the owner also has their teamId set to this team.
    const owner = await db.getAccount(team.ownerUsername);
    if (owner && owner.teamId !== team.id) {
      await db.saveAccount({ ...owner, teamId: team.id });
    }
    await db.saveTeam({
      ...team,
      members: finalMembers,
      pendingMembers: [],
      status: 'approved',
      reviewedAt: Date.now(),
      reviewedBy: account.username,
      rejectionReason: null,
    });
    refresh();
  };
  const reject = async (team) => {
    const reason = prompt('Rejection reason (optional):') || '';
    await db.saveTeam({ ...team, status: 'rejected', reviewedAt: Date.now(), reviewedBy: account.username, rejectionReason: reason });
    refresh();
  };
  const removeTeam = async (team) => {
    if (!confirm(`Delete team "${team.name}" permanently?`)) return;
    await db.deleteTeam(team.id);
    for (const memberName of team.members) {
      const m = await db.getAccount(memberName);
      if (m && m.teamId === team.id) await db.saveAccount({ ...m, teamId: null });
    }
    refresh();
  };

  const pending = teams.filter(t => t.status === 'pending');
  const approved = teams.filter(t => t.status === 'approved');
  const rejected = teams.filter(t => t.status === 'rejected');
  const visible = tab === 'pending' ? pending : tab === 'approved' ? approved : rejected;

  const updateSeason = async () => {
    if (!seasonInput.trim()) return;
    await db.setSeason(seasonInput.trim().toUpperCase());
    setCurrentSeason(seasonInput.trim().toUpperCase());
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Crown size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>ADMIN PANEL</h3>
      </div>

      {/* TOP-LEVEL ADMIN SECTION TABS */}
      <div className="flex gap-1 mb-5 p-1 rounded flex-wrap" style={{ background: `${C.navyDeep}88` }}>
        {[
          { id: 'stats',   label: 'STATS',   icon: BarChart3 },
          { id: 'teams',   label: 'TEAMS',   icon: Users },
          { id: 'totw',    label: 'TOTW',    icon: Trophy },
          { id: 'players', label: 'PLAYERS', icon: User },
          { id: 'import',  label: 'IMPORT',  icon: TrendingUp },
          { id: 'pictures',label: 'PICTURES',icon: User },
          { id: 'awards',  label: 'AWARDS',  icon: Trophy },
          { id: 'season',  label: 'SEASON',  icon: Calendar },
          ...(isSuperAdmin(account) ? [
            { id: 'admins', label: 'ADMINS', icon: Crown },
            { id: 'weights', label: 'WEIGHTS', icon: Sparkles },
          ] : []),
        ].map(s => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="flex-1 px-3 py-2 font-heading tracking-wider text-[11px] rounded transition-all flex items-center justify-center gap-1.5"
              style={{
                background: active ? `${C.goldLight}22` : 'transparent',
                color: active ? C.goldLight : `${C.cream}88`,
                border: `1px solid ${active ? C.goldLight : 'transparent'}66`,
              }}
            ><s.icon size={12} /> {s.label}</button>
          );
        })}
      </div>

      {section === 'admins' && isSuperAdmin(account) && (
        <AdminsManager account={account} allPlayers={allPlayers} dynamicAdmins={dynamicAdmins} onRefresh={() => { refresh(); onRefreshAdmins && onRefreshAdmins(); }} />
      )}

      {section === 'weights' && isSuperAdmin(account) && (
        <WeightingsManager onRefresh={refresh} />
      )}

      {section === 'stats' && (
        <StatsManager account={account} allPlayers={allPlayers} allTeams={allTeams} currentSeason={currentSeason} onRefresh={refresh} />
      )}

      {section === 'import' && (
        <ImportMatchManager account={account} allPlayers={allPlayers} allTeams={allTeams} currentSeason={currentSeason} onRefresh={refresh} />
      )}

      {section === 'pictures' && (
        <PicturesManager allPlayers={allPlayers} onRefresh={refresh} />
      )}

      {section === 'players' && (
        <PlayersManager allPlayers={allPlayers} allTeams={allTeams} onRefresh={refresh} />
      )}

      {section === 'totw' && (
        <TotwManager allPlayers={allPlayers} onRefresh={refresh} />
      )}

      {section === 'season' && (
        <SeasonManager
          account={account}
          allPlayers={allPlayers}
          currentSeason={currentSeason}
          onRefresh={refresh}
        />
      )}

      {section === 'awards' && (
        <div className="space-y-8">
          <AwardsManager account={account} allPlayers={allPlayers} onRefresh={refresh} currentSeason={currentSeason} />
          <SeasonChampionsManager account={account} allPlayers={allPlayers} allTeams={allTeams} currentSeason={currentSeason} onRefresh={refresh} />
        </div>
      )}

      {section === 'teams' && (
        <>
          <div className="flex gap-1 mb-4 p-1 rounded" style={{ background: `${C.navyDeep}88` }}>
            {[
              { id: 'pending', label: `PENDING (${pending.length})`, color: C.goldLight },
              { id: 'approved', label: `APPROVED (${approved.length})`, color: C.greenLight },
              { id: 'rejected', label: `REJECTED (${rejected.length})`, color: C.redLight },
            ].map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex-1 px-3 py-2 font-heading tracking-wider text-[10px] rounded transition-all"
                  style={{
                    background: active ? `${t.color}22` : 'transparent',
                    color: active ? t.color : `${C.cream}55`,
                    border: `1px solid ${active ? t.color : 'transparent'}66`,
                  }}
                >{t.label}</button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={<CheckCircle size={40} />} text="Nothing here." />
          ) : (
            <div className="space-y-2">
              {visible.map(t => (
                <div key={t.id} className="rounded-lg p-4" style={{
                  background: `${C.navyDeep}aa`,
                  border: `1px solid ${C.navyLight}44`,
                  borderLeft: `3px solid ${t.color || C.green}`,
                }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>{t.name.toUpperCase()}</span>
                        <span className="font-heading text-xs px-2 py-0.5 rounded tracking-widest" style={{
                          background: t.color || C.green, color: C.onColor,
                        }}>{t.tag}</span>
                      </div>
                      <div className="font-mono text-[10px] tracking-wider mt-1" style={{ color: `${C.cream}66` }}>
                        BY <span style={{ color: C.cream }}>{t.ownerUsername.toUpperCase()}</span> • {new Date(t.createdAt).toLocaleString()}
                      </div>
                      {t.description && <p className="font-body text-sm mt-2" style={{ color: `${C.cream}cc` }}>{t.description}</p>}
                      {t.rejectionReason && (
                        <p className="font-mono text-xs mt-1" style={{ color: C.redLight }}>REJECTION: {t.rejectionReason}</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {tab === 'pending' && (
                        <>
                          <button onClick={() => approve(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1" style={{
                            background: C.green, color: C.onColor,
                          }}><CheckCircle size={12} /> APPROVE</button>
                          <button onClick={() => reject(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1" style={{
                            background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66`,
                          }}><XCircle size={12} /> REJECT</button>
                        </>
                      )}
                      {tab === 'approved' && (
                        <>
                          <button onClick={() => setEditingTeam(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded" style={{
                            background: `${C.navyLight}88`, color: C.cream, border: `1px solid ${C.navyLight}`,
                          }}>EDIT</button>
                          <button onClick={() => removeTeam(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded" style={{
                            background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66`,
                          }}>DELETE</button>
                        </>
                      )}
                      {tab === 'rejected' && (
                        <button onClick={() => approve(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded" style={{
                          background: C.green, color: C.onColor,
                        }}>RE-APPROVE</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editingTeam && (
        <EditTeamModal
          team={editingTeam}
          onClose={() => setEditingTeam(null)}
          onSaved={() => { setEditingTeam(null); refresh(); }}
        />
      )}
    </div>
  );
};

// ============ SEASON MANAGER (admin) ============
const SeasonManager = ({ account, allPlayers, currentSeason, onRefresh }) => {
  const [customName, setCustomName] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState('');

  // Discover all seasons that have matches
  const allSeasons = useMemo(() => {
    const seasonsSet = new Set([currentSeason]);
    allPlayers.forEach(p => (p.matches || []).forEach(m => {
      if (m.season) seasonsSet.add(m.season);
    }));
    return Array.from(seasonsSet).sort();
  }, [allPlayers, currentSeason]);

  // Determine the next season number (auto-increment from current)
  const suggestNext = (current) => {
    const m = current.match(/^S(\d+)$/i);
    if (m) return `S${parseInt(m[1], 10) + 1}`;
    return 'S2';
  };
  const nextSeason = suggestNext(currentSeason);

  const startNextSeason = async () => {
    if (!confirm(
      `Start ${nextSeason}?\n\nFrom now on, all new matches will be tagged ${nextSeason}.\nPast season stats will still be viewable, but ${currentSeason} is now closed.\n\nMake sure ${currentSeason} awards have been assigned first!`
    )) return;
    await db.setSeason(nextSeason);
    onRefresh();
  };

  const setCustom = async () => {
    setError('');
    const name = customName.trim().toUpperCase();
    if (!name) { setError('Enter a season name'); return; }
    if (!/^[A-Z0-9-]+$/.test(name)) { setError('Letters, numbers, and dashes only'); return; }
    if (!confirm(`Switch active season to ${name}?`)) return;
    await db.setSeason(name);
    setCustomName('');
    setShowCustom(false);
    onRefresh();
  };

  // Per-season stats summary (matches & participating players)
  const seasonSummaries = allSeasons.map(s => {
    let matches = 0;
    const players = new Set();
    allPlayers.forEach(p => (p.matches || []).forEach(m => {
      if ((m.season || 'S1') === s) {
        matches += 1;
        players.add(p.username);
      }
    }));
    return { season: s, matches, players: players.size };
  });

  return (
    <div className="space-y-5">
      {/* CURRENT SEASON DISPLAY */}
      <div className="rounded-xl p-5" style={{
        background: `linear-gradient(135deg, ${C.gold}22 0%, ${C.navyDeep}cc 100%)`,
        border: `1px solid ${C.gold}66`,
        boxShadow: `0 4px 16px ${C.gold}22`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: C.greenLight }} />
          <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: `${C.cream}99` }}>CURRENTLY ACTIVE</span>
        </div>
        <div className="font-display text-5xl tracking-wider mb-1" style={{ color: C.goldLight }}>
          SEASON {currentSeason.replace(/^S/, '')}
        </div>
        <div className="font-mono text-[11px] tracking-wider" style={{ color: `${C.cream}88` }}>
          ALL NEW MATCHES TAGGED <span style={{ color: C.goldLight }}>{currentSeason}</span>
        </div>
      </div>

      {/* START NEXT SEASON */}
      <div className="rounded-xl p-4" style={{
        background: `${C.navyDeep}aa`,
        border: `1px solid ${C.navyLight}66`,
      }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={{ color: C.greenLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.cream }}>START NEXT SEASON</span>
        </div>
        <p className="font-body text-sm mb-3" style={{ color: `${C.cream}aa` }}>
          One click closes <strong>{currentSeason}</strong> and opens <strong>{nextSeason}</strong>. Past season stats and awards are kept forever. Players will see their {currentSeason} stats frozen, while new matches go into {nextSeason}.
        </p>
        <button
          onClick={startNextSeason}
          className="w-full py-3 font-heading tracking-wider text-base rounded transition-all hover:scale-[1.01]"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor,
            boxShadow: `0 4px 12px ${C.green}66`,
          }}
        >▶ START {nextSeason}</button>

        <button
          onClick={() => setShowCustom(s => !s)}
          className="w-full mt-2 py-1.5 font-mono text-[10px] tracking-[0.2em]"
          style={{ color: `${C.cream}77` }}
        >{showCustom ? '▲ HIDE CUSTOM NAME' : '▼ USE CUSTOM SEASON NAME'}</button>

        {showCustom && (
          <div className="mt-2">
            <div className="flex gap-2">
              <input
                type="text" value={customName}
                onChange={(e) => setCustomName(e.target.value.toUpperCase())}
                placeholder="e.g. WINTER25"
                className="flex-1 rounded px-3 py-2 font-mono focus:outline-none"
                style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              />
              <button onClick={setCustom} className="px-4 py-2 font-heading tracking-wider text-xs rounded" style={{
                background: C.gold, color: C.brandNavy,
              }}>SET</button>
            </div>
            {error && <div className="mt-1 font-mono text-xs" style={{ color: C.redLight }}>{error}</div>}
          </div>
        )}
      </div>

      {/* SEASON HISTORY */}
      <div>
        <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
          <Clock size={14} style={{ color: C.goldLight }} /> SEASON HISTORY
        </h4>
        {seasonSummaries.length === 0 ? (
          <EmptyState icon={<Calendar size={36} />} text="No past seasons yet." />
        ) : (
          <div className="space-y-1.5">
            {seasonSummaries.map(s => {
              const isActive = s.season === currentSeason;
              return (
                <div key={s.season} className="rounded p-3 flex items-center gap-3" style={{
                  background: isActive ? `${C.green}22` : `${C.navyDeep}aa`,
                  border: `1px solid ${isActive ? C.greenLight : C.navyLight}55`,
                  borderLeft: `3px solid ${isActive ? C.greenLight : C.navyLight}`,
                }}>
                  <div className="flex-1">
                    <div className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>
                      {s.season}
                      {isActive && <span className="ml-2 font-mono text-[10px] px-2 py-0.5 rounded" style={{
                        background: C.greenLight, color: C.onColor,
                      }}>ACTIVE</span>}
                    </div>
                    <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.cream}77` }}>
                      {s.matches} {s.matches === 1 ? 'MATCH' : 'MATCHES'} • {s.players} {s.players === 1 ? 'PLAYER' : 'PLAYERS'}
                    </div>
                  </div>
                  {!isActive && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Re-activate ${s.season}? New matches will be tagged with this season again.`)) return;
                        await db.setSeason(s.season);
                        onRefresh();
                      }}
                      className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded"
                      style={{ background: `${C.gold}22`, color: C.goldLight, border: `1px solid ${C.gold}66` }}
                    >RE-ACTIVATE</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============ AWARDS MANAGER (admin) ============
const AwardsManager = ({ account, allPlayers, onRefresh, currentSeason }) => {
  const [season, setSeason] = useState(currentSeason);
  const [awardId, setAwardId] = useState('striker');
  const [winnerUsername, setWinnerUsername] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => { setSeason(currentSeason); }, [currentSeason]);

  const award = AWARD_BY_ID[awardId];

  // Filter candidate winners: by ideal position for the award (but allow any)
  const idealCandidates = allPlayers.filter(p => p.position === award.pos);
  const otherCandidates = allPlayers.filter(p => p.position !== award.pos);

  const assignAward = async () => {
    setError(''); setInfo('');
    if (!winnerUsername) { setError('Pick a winner'); return; }
    if (!season.trim()) { setError('Season required'); return; }
    const player = await db.getAccount(winnerUsername);
    if (!player) { setError('Player not found'); return; }
    const existingAwards = player.awards || [];
    // Prevent same award + same season duplicate
    if (existingAwards.some(a => a.awardId === awardId && a.season === season)) {
      setError(`${player.username} already has ${award.name} for ${season}`);
      return;
    }
    const newAward = {
      awardId, season,
      assignedBy: account.username,
      assignedAt: Date.now(),
    };
    const updated = { ...player, awards: [...existingAwards, newAward] };
    await db.saveAccount(updated);
    setInfo(`✓ ${award.name} ${season} assigned to ${player.username}`);
    setWinnerUsername('');
    onRefresh();
  };

  const removeAward = async (player, awardIdx) => {
    if (!confirm(`Remove this award from ${player.username}?`)) return;
    const updated = { ...player, awards: player.awards.filter((_, i) => i !== awardIdx) };
    await db.saveAccount(updated);
    onRefresh();
  };

  // List all current award holders (across all seasons)
  const allAwards = [];
  allPlayers.forEach(p => {
    (p.awards || []).forEach((aw, i) => {
      allAwards.push({ ...aw, player: p, idx: i });
    });
  });
  allAwards.sort((a, b) => b.assignedAt - a.assignedAt);

  return (
    <div className="space-y-5">
      {/* ASSIGN NEW AWARD */}
      <div className="rounded-lg p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.navyDeep}aa 100%)`,
        border: `1px solid ${C.gold}44`,
      }}>
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.cream }}>ASSIGN AWARD</span>
        </div>

        {/* Award type picker */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {AWARD_TYPES.map(a => {
            const active = awardId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAwardId(a.id)}
                className="p-3 rounded transition-all flex flex-col items-center gap-1.5"
                style={{
                  background: active ? `${C.gold}22` : `${C.navyLight}33`,
                  border: `1.5px solid ${active ? C.gold : 'transparent'}`,
                }}
              >
                <AwardIcon awardId={a.id} size={28} />
                <span className="font-heading text-[10px] tracking-wider" style={{ color: C.cream }}>{a.name.toUpperCase()}</span>
                <span className="font-mono text-[9px]" style={{ color: `${C.cream}66` }}>{a.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>SEASON</label>
            <input
              type="text" value={season}
              onChange={(e) => setSeason(e.target.value.toUpperCase())}
              className="w-full rounded px-3 py-2 font-mono focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
            />
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>WINNER</label>
            <select
              value={winnerUsername}
              onChange={(e) => setWinnerUsername(e.target.value)}
              className="w-full rounded px-3 py-2 font-body focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
            >
              <option value="" style={{ background: C.navyDeep }}>— Select winner —</option>
              {idealCandidates.length > 0 && (
                <optgroup label={`${award.pos} players`}>
                  {idealCandidates.map(p => <option key={p.username} value={p.username} style={{ background: C.navyDeep }}>{p.username}</option>)}
                </optgroup>
              )}
              {otherCandidates.length > 0 && (
                <optgroup label="Other players">
                  {otherCandidates.map(p => <option key={p.username} value={p.username} style={{ background: C.navyDeep }}>{p.username} ({p.position})</option>)}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {error && <div className="mt-2 font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}
        {info && <div className="mt-2 font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.green}22`, color: C.greenLight }}>{info}</div>}

        <button
          onClick={assignAward}
          className="w-full mt-3 py-2.5 font-heading tracking-wider text-sm rounded"
          style={{
            background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLight} 100%)`,
            color: C.brandNavy,
            boxShadow: `0 4px 12px ${C.gold}66`,
          }}
        >ASSIGN {award.name.toUpperCase()}</button>
      </div>

      {/* CURRENT AWARDS LIST */}
      <div>
        <h4 className="font-display text-xl tracking-wider mb-3" style={{ color: C.cream }}>
          CURRENT WINNERS ({allAwards.length})
        </h4>
        {allAwards.length === 0 ? (
          <EmptyState icon={<Trophy size={40} />} text="No awards assigned yet." />
        ) : (
          <div className="space-y-1.5">
            {allAwards.map((aw, i) => {
              const a = AWARD_BY_ID[aw.awardId];
              return (
                <div key={i} className="rounded p-2.5 flex items-center gap-3" style={{
                  background: `${C.navyDeep}aa`, border: `1px solid ${C.gold}33`,
                }}>
                  <AwardIcon awardId={aw.awardId} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="font-heading tracking-wider text-sm" style={{ color: C.cream }}>
                      {a.name.toUpperCase()} <span style={{ color: C.goldLight }}>{aw.season}</span>
                    </div>
                    <div className="font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
                      {aw.player.username} • assigned by {aw.assignedBy}
                    </div>
                  </div>
                  <button
                    onClick={() => removeAward(aw.player, aw.idx)}
                    className="px-2 py-1 font-heading tracking-wider text-[10px] rounded"
                    style={{ background: `${C.red}22`, color: C.redLight, border: `1px solid ${C.red}44` }}
                  >REMOVE</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};


// ============ SEASON CHAMPIONS MANAGER (admin: pick winner + runner-up per season) ============
// Picks a winner team and a runner-up team for a given season. On save, the current
// rosters of those teams get a `championship` entry stamped onto each player's account
// (so transferring later doesn't strip the trophy). Editing a past season wipes any
// previous championship entries for that season first.
const SeasonChampionsManager = ({ account, allPlayers, allTeams, currentSeason, onRefresh }) => {
  const [champions, setChampions] = useState({});             // { S1: { winnerTeamId, runnerUpTeamId } }
  const [editingSeason, setEditingSeason] = useState(currentSeason);
  const [winnerTeamId, setWinnerTeamId] = useState('');
  const [runnerUpTeamId, setRunnerUpTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [confirming, setConfirming] = useState(null);          // 'save' | 'clear' | null

  const approvedTeams = useMemo(
    () => allTeams.filter(t => t.status === 'approved').sort((a, b) => a.name.localeCompare(b.name)),
    [allTeams]
  );

  // Load championships once
  useEffect(() => {
    (async () => {
      const c = await db.getChampions();
      setChampions(c || {});
    })();
  }, []);

  // Whenever the editing season changes, pre-fill from saved values
  useEffect(() => {
    const existing = champions[editingSeason] || {};
    setWinnerTeamId(existing.winnerTeamId || '');
    setRunnerUpTeamId(existing.runnerUpTeamId || '');
    setError(''); setInfo('');
  }, [editingSeason, champions]);

  const teamById = (id) => approvedTeams.find(t => t.id === id) || allTeams.find(t => t.id === id);
  const playersOnTeam = (teamId) => allPlayers.filter(p => p.teamId === teamId);

  // Collect every season that currently has championships set, plus the current season
  const knownSeasons = useMemo(() => {
    const set = new Set(Object.keys(champions));
    set.add(currentSeason);
    return Array.from(set).sort();
  }, [champions, currentSeason]);

  const reset = () => {
    setError(''); setInfo(''); setConfirming(null);
  };

  // Save handler — confirms first to make the impact explicit
  const requestSave = () => {
    setError(''); setInfo('');
    if (!editingSeason.trim()) { setError('Pick a season'); return; }
    if (!winnerTeamId && !runnerUpTeamId) { setError('Pick at least a winner or runner-up'); return; }
    if (winnerTeamId && winnerTeamId === runnerUpTeamId) {
      setError('Winner and runner-up cannot be the same team');
      return;
    }
    setConfirming('save');
  };

  const doSave = async () => {
    setBusy(true);
    setError(''); setInfo('');
    try {
      // 1. Strip any existing championship entries for this season from every player.
      // (Edit-safe: if the admin is reassigning S1, the old S1 trophies are removed first.)
      const playersToUpdate = [];
      for (const p of allPlayers) {
        const champs = p.championships || [];
        const filtered = champs.filter(c => c.season !== editingSeason);
        if (filtered.length !== champs.length) {
          playersToUpdate.push({ ...p, championships: filtered });
        }
      }

      // 2. Stamp the new championship onto current roster members of the chosen teams.
      const now = Date.now();
      const stampOn = (teamId, placement) => {
        if (!teamId) return;
        const team = teamById(teamId);
        if (!team) return;
        for (const p of playersOnTeam(teamId)) {
          // If this player is already in playersToUpdate from step 1, mutate that copy.
          let target = playersToUpdate.find(x => x.id === p.id);
          if (!target) {
            target = { ...p, championships: [...(p.championships || [])] };
            playersToUpdate.push(target);
          } else {
            target.championships = [...(target.championships || [])];
          }
          target.championships.push({
            season: editingSeason,
            placement,
            teamId,
            awardedAt: now,
          });
        }
      };
      stampOn(winnerTeamId, 'winner');
      stampOn(runnerUpTeamId, 'runner_up');

      // 3. Persist all account changes.
      for (const p of playersToUpdate) {
        await db.saveAccount(p);
      }

      // 4. Update the season_champions setting.
      const next = { ...champions };
      if (!winnerTeamId && !runnerUpTeamId) {
        delete next[editingSeason];
      } else {
        next[editingSeason] = {
          winnerTeamId: winnerTeamId || null,
          runnerUpTeamId: runnerUpTeamId || null,
          setAt: now,
        };
      }
      await db.setChampions(next);
      setChampions(next);

      const wTeam = winnerTeamId ? teamById(winnerTeamId) : null;
      const rTeam = runnerUpTeamId ? teamById(runnerUpTeamId) : null;
      const wCount = wTeam ? playersOnTeam(winnerTeamId).length : 0;
      const rCount = rTeam ? playersOnTeam(runnerUpTeamId).length : 0;
      const parts = [];
      if (wTeam) parts.push(`${wTeam.name} (winner) — ${wCount} player${wCount === 1 ? '' : 's'}`);
      if (rTeam) parts.push(`${rTeam.name} (runner-up) — ${rCount} player${rCount === 1 ? '' : 's'}`);
      setInfo(`Saved ${editingSeason}: ${parts.join(' · ')}`);
      setConfirming(null);
      if (onRefresh) await onRefresh();
    } catch (e) {
      setError('Save failed: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const requestClear = () => {
    if (!champions[editingSeason]) { setError(`No championship set for ${editingSeason}`); return; }
    setError(''); setInfo('');
    setConfirming('clear');
  };

  const doClear = async () => {
    setBusy(true);
    try {
      // Strip all championship entries for this season from every player
      const playersToUpdate = [];
      for (const p of allPlayers) {
        const champs = p.championships || [];
        const filtered = champs.filter(c => c.season !== editingSeason);
        if (filtered.length !== champs.length) {
          playersToUpdate.push({ ...p, championships: filtered });
        }
      }
      for (const p of playersToUpdate) await db.saveAccount(p);

      const next = { ...champions };
      delete next[editingSeason];
      await db.setChampions(next);
      setChampions(next);
      setWinnerTeamId(''); setRunnerUpTeamId('');
      setInfo(`Cleared ${editingSeason} championships.`);
      setConfirming(null);
      if (onRefresh) await onRefresh();
    } catch (e) {
      setError('Clear failed: ' + (e?.message || e));
    }
    setBusy(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>SEASON CHAMPIONS</h3>
      </div>
      <p className="font-body text-sm mb-4" style={{ color: `${C.cream}99` }}>
        Pick the season winner (gold trophy) and runner-up (silver trophy). The trophy is awarded to the team's <span style={{ color: C.goldLight }}>current roster</span> — players who later transfer keep their trophy. Editing a season replaces the previous result.
      </p>

      {/* SEASON PICKER + TEAM PICKERS */}
      <div className="rounded-xl p-4 mb-6" style={{ background: `${C.navyDeep}88`, border: `1px solid ${C.navyLight}66` }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.cream}99` }}>SEASON</div>
            <div className="flex gap-2">
              <select
                value={editingSeason}
                onChange={(e) => setEditingSeason(e.target.value)}
                className="flex-1 px-3 py-2 font-body text-sm rounded focus:outline-none"
                style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}88`, color: C.cream }}
              >
                {knownSeasons.map(s => <option key={s} value={s} style={{ background: C.navyDeep }}>{s}</option>)}
                {!knownSeasons.includes(editingSeason) && (
                  <option value={editingSeason} style={{ background: C.navyDeep }}>{editingSeason}</option>
                )}
              </select>
              <input
                type="text"
                placeholder="New season..."
                onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { setEditingSeason(e.currentTarget.value.trim().toUpperCase()); e.currentTarget.value = ''; } }}
                className="w-28 px-2 py-2 font-mono text-[11px] rounded focus:outline-none"
                style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}88`, color: C.cream }}
                title="Type a new season name and press Enter"
              />
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.cream}99` }}>
              🥇 WINNER (GOLD TROPHY)
            </div>
            <select
              value={winnerTeamId}
              onChange={(e) => setWinnerTeamId(e.target.value)}
              className="w-full px-3 py-2 font-body text-sm rounded focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.gold}66`, color: C.cream }}
            >
              <option value="" style={{ background: C.navyDeep }}>— None —</option>
              {approvedTeams.map(t => (
                <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>
                  {t.name} ({playersOnTeam(t.id).length} players)
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.cream}99` }}>
              🥈 RUNNER-UP (SILVER TROPHY)
            </div>
            <select
              value={runnerUpTeamId}
              onChange={(e) => setRunnerUpTeamId(e.target.value)}
              className="w-full px-3 py-2 font-body text-sm rounded focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid #cdd3dc66`, color: C.cream }}
            >
              <option value="" style={{ background: C.navyDeep }}>— None —</option>
              {approvedTeams.map(t => (
                <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>
                  {t.name} ({playersOnTeam(t.id).length} players)
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="mt-3 font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}
        {info && <div className="mt-3 font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.green}22`, color: C.greenLight }}>{info}</div>}

        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            onClick={requestSave}
            disabled={busy}
            className="flex-1 py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLight} 100%)`,
              color: C.brandNavy,
              boxShadow: `0 4px 12px ${C.gold}66`,
            }}
          >{busy ? 'WORKING...' : `SAVE ${editingSeason} CHAMPIONS`}</button>
          {champions[editingSeason] && (
            <button
              onClick={requestClear}
              disabled={busy}
              className="px-4 py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50"
              style={{ background: 'transparent', color: C.redLight, border: `1px solid ${C.red}88` }}
            >CLEAR {editingSeason}</button>
          )}
        </div>

        {/* Roster preview */}
        {(winnerTeamId || runnerUpTeamId) && (
          <div className="mt-4 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ borderTop: `1px solid ${C.navyLight}44` }}>
            {winnerTeamId && (
              <div>
                <div className="font-mono text-[10px] tracking-wider mb-1" style={{ color: C.goldLight }}>
                  PLAYERS GETTING THE GOLD TROPHY
                </div>
                <div className="font-body text-xs" style={{ color: C.cream }}>
                  {playersOnTeam(winnerTeamId).length === 0
                    ? <span style={{ color: `${C.cream}66`, fontStyle: 'italic' }}>No current players on this team</span>
                    : playersOnTeam(winnerTeamId).map(p => p.username).join(', ')}
                </div>
              </div>
            )}
            {runnerUpTeamId && (
              <div>
                <div className="font-mono text-[10px] tracking-wider mb-1" style={{ color: '#cdd3dc' }}>
                  PLAYERS GETTING THE SILVER TROPHY
                </div>
                <div className="font-body text-xs" style={{ color: C.cream }}>
                  {playersOnTeam(runnerUpTeamId).length === 0
                    ? <span style={{ color: `${C.cream}66`, fontStyle: 'italic' }}>No current players on this team</span>
                    : playersOnTeam(runnerUpTeamId).map(p => p.username).join(', ')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: `${C.black}cc`, backdropFilter: 'blur(8px)' }}>
          <div className="max-w-md w-full rounded-xl p-5" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
            <div className="font-display text-xl tracking-wider mb-2" style={{ color: C.brandNavy }}>
              {confirming === 'save' ? `SAVE ${editingSeason} CHAMPIONS?` : `CLEAR ${editingSeason}?`}
            </div>
            <div className="font-body text-sm mb-4" style={{ color: `${C.brandNavy}cc` }}>
              {confirming === 'save'
                ? `This will award trophies to the current rosters. ${champions[editingSeason] ? `Any previous ${editingSeason} trophies will be removed first (players who have since transferred will lose them).` : ''}`
                : `Every player who currently holds a ${editingSeason} trophy will lose it. This cannot be undone.`}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(null)}
                disabled={busy}
                className="flex-1 py-2 font-heading tracking-wider text-sm rounded"
                style={{ background: 'transparent', color: C.brandNavy, border: `1px solid ${C.navyLight}` }}
              >CANCEL</button>
              <button
                onClick={confirming === 'save' ? doSave : doClear}
                disabled={busy}
                className="flex-1 py-2 font-heading tracking-wider text-sm rounded disabled:opacity-50"
                style={{
                  background: confirming === 'save' ? C.gold : C.red,
                  color: confirming === 'save' ? C.brandNavy : C.onColor,
                }}
              >{busy ? 'WORKING...' : confirming === 'save' ? 'YES, AWARD' : 'YES, CLEAR'}</button>
            </div>
          </div>
        </div>
      )}

      {/* PAST SEASONS LIST */}
      <div>
        <h4 className="font-display text-lg tracking-wider mb-2" style={{ color: C.cream }}>
          RECORD ({Object.keys(champions).length} season{Object.keys(champions).length === 1 ? '' : 's'})
        </h4>
        {Object.keys(champions).length === 0 ? (
          <EmptyState icon={<Trophy size={40} />} text="No season champions recorded yet." />
        ) : (
          <div className="space-y-1.5">
            {Object.entries(champions).sort(([a], [b]) => a.localeCompare(b)).map(([season, info]) => {
              const w = info.winnerTeamId ? teamById(info.winnerTeamId) : null;
              const r = info.runnerUpTeamId ? teamById(info.runnerUpTeamId) : null;
              return (
                <div key={season} className="rounded p-2.5 flex items-center gap-3" style={{
                  background: `${C.navyDeep}aa`, border: `1px solid ${C.gold}33`,
                }}>
                  <div className="font-display text-lg tracking-wider" style={{ color: C.goldLight, width: 48 }}>{season}</div>
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    <div className="font-body text-sm" style={{ color: C.cream }}>
                      🥇 <span style={{ color: C.goldLight }}>Winner:</span> {w ? w.name : <span style={{ color: `${C.cream}66`, fontStyle: 'italic' }}>—</span>}
                    </div>
                    <div className="font-body text-sm" style={{ color: C.cream }}>
                      🥈 <span style={{ color: '#cdd3dc' }}>Runner-Up:</span> {r ? r.name : <span style={{ color: `${C.cream}66`, fontStyle: 'italic' }}>—</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingSeason(season); reset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="font-mono text-[10px] tracking-wider px-2 py-1 rounded"
                    style={{ background: 'transparent', color: C.goldLight, border: `1px solid ${C.gold}44` }}
                  >EDIT</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};


// ============ STATS MANAGER (admin: 2-admin review system) ============
const StatsManager = ({ account, allPlayers, allTeams, currentSeason, onRefresh }) => {
  const [view, setView] = useState('home'); // home | submit | review
  const [submissions, setSubmissions] = useState([]);
  const [reviewing, setReviewing] = useState(null);

  const refresh = async () => {
    setSubmissions(await db.listSubmissions());
  };
  useEffect(() => { refresh(); }, []);

  const myUsername = account.username.toLowerCase();
  // Same admin can't review their own submission
  const myPending      = submissions.filter(s => s.status === 'pending' && s.submittedBy.toLowerCase() === myUsername);
  const reviewable     = submissions.filter(s => s.status === 'pending' && s.submittedBy.toLowerCase() !== myUsername);
  const recentApproved = submissions.filter(s => s.status === 'approved').sort((a, b) => b.reviewedAt - a.reviewedAt).slice(0, 5);
  const recentRejected = submissions.filter(s => s.status === 'rejected').sort((a, b) => b.reviewedAt - a.reviewedAt).slice(0, 5);

  if (view === 'submit') {
    return <SubmitMatchStats
      account={account} allPlayers={allPlayers} allTeams={allTeams} currentSeason={currentSeason}
      existing={null}
      onCancel={() => setView('home')}
      onSubmitted={() => { setView('home'); refresh(); }}
    />;
  }
  if (view === 'review' && reviewing) {
    return <ReviewMatchStats
      account={account} allPlayers={allPlayers} allTeams={allTeams}
      submission={reviewing}
      onBack={() => { setReviewing(null); setView('home'); refresh(); onRefresh(); }}
    />;
  }

  return (
    <div className="space-y-5">
      {/* BIG START BUTTON */}
      <button
        onClick={() => setView('submit')}
        className="w-full py-5 font-display tracking-wider text-2xl rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.01]"
        style={{
          background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
          color: C.onColor,
          boxShadow: `0 6px 20px ${C.green}77`,
          border: `1px solid ${C.greenLight}`,
        }}
      >
        <Plus size={26} /> ADD STATS FROM A MATCH
      </button>

      {/* PENDING REVIEW (matches submitted by other admins, awaiting your approval) */}
      <div>
        <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
          <Clock size={14} style={{ color: C.goldLight }} /> NEEDS YOUR REVIEW ({reviewable.length})
        </h4>
        {reviewable.length === 0 ? (
          <div className="rounded-lg p-4 text-center" style={{ background: `${C.navyDeep}66`, border: `1px dashed ${C.navyLight}55` }}>
            <p className="font-mono text-xs tracking-wider" style={{ color: `${C.cream}66` }}>
              NOTHING TO REVIEW. WHEN ANOTHER ADMIN SUBMITS A MATCH, IT'LL APPEAR HERE.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {reviewable.map(s => (
              <SubmissionRow key={s.id} sub={s} allTeams={allTeams}
                onClick={() => { setReviewing(s); setView('review'); }}
                action="REVIEW" actionColor={C.gold} />
            ))}
          </div>
        )}
      </div>

      {/* MY PENDING (waiting for someone else to review) */}
      {myPending.length > 0 && (
        <div>
          <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
            <Clock size={14} style={{ color: `${C.cream}66` }} /> WAITING FOR ANOTHER ADMIN ({myPending.length})
          </h4>
          <div className="space-y-2">
            {myPending.map(s => (
              <SubmissionRow key={s.id} sub={s} allTeams={allTeams} dim
                action="WAITING" actionColor={`${C.cream}55`} />
            ))}
          </div>
        </div>
      )}

      {/* RECENT APPROVED */}
      {recentApproved.length > 0 && (
        <div>
          <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
            <CheckCircle size={14} style={{ color: C.greenLight }} /> RECENTLY APPROVED
          </h4>
          <div className="space-y-2">
            {recentApproved.map(s => (
              <SubmissionRow key={s.id} sub={s} allTeams={allTeams} dim status="approved" />
            ))}
          </div>
        </div>
      )}

      {/* RECENT REJECTED */}
      {recentRejected.length > 0 && (
        <div>
          <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
            <XCircle size={14} style={{ color: C.redLight }} /> RECENTLY REJECTED
          </h4>
          <div className="space-y-2">
            {recentRejected.map(s => (
              <SubmissionRow key={s.id} sub={s} allTeams={allTeams} dim status="rejected" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SubmissionRow = ({ sub, allTeams, dim = false, status, onClick, action, actionColor }) => {
  const home = allTeams.find(t => t.id === sub.matchInfo.homeTeamId);
  const away = allTeams.find(t => t.id === sub.matchInfo.awayTeamId);
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`rounded-lg p-3 flex items-center justify-between gap-3 ${clickable ? 'cursor-pointer transition-all hover:scale-[1.01]' : ''}`}
      style={{
        background: `${C.navyDeep}aa`,
        border: `1px solid ${C.navyLight}44`,
        borderLeft: `3px solid ${
          status === 'approved' ? C.greenLight :
          status === 'rejected' ? C.redLight :
          actionColor || C.gold
        }`,
        opacity: dim ? 0.7 : 1,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>
          {(home?.name || '?').toUpperCase()} <span style={{ color: `${C.cream}66` }}>{sub.matchInfo.homeScore} — {sub.matchInfo.awayScore}</span> {(away?.name || '?').toUpperCase()}
        </div>
        <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.cream}66` }}>
          {new Date(sub.matchInfo.date).toLocaleDateString()} • {sub.matchInfo.season} • {sub.playerStats.length} PLAYERS • BY {sub.submittedBy.toUpperCase()}
        </div>
      </div>
      {action && (
        <div className="font-heading tracking-wider text-[11px] px-3 py-1.5 rounded flex-shrink-0" style={{
          background: actionColor === C.gold ? C.gold : `${actionColor}33`,
          color: actionColor === C.gold ? C.brandNavy : actionColor,
        }}>{action}</div>
      )}
    </div>
  );
};

// ============ SUBMIT MATCH STATS FORM ============
const SubmitMatchStats = ({ account, allPlayers, allTeams, currentSeason, existing, onCancel, onSubmitted }) => {
  const [step, setStep] = useState(1);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const [matchInfo, setMatchInfo] = useState(existing?.matchInfo || {
    date: today.getTime(),
    season: currentSeason,
    homeTeamId: '',
    awayTeamId: '',
    homeScore: 0,
    awayScore: 0,
  });
  const [selectedUsernames, setSelectedUsernames] = useState(
    new Set((existing?.playerStats || []).map(p => p.username.toLowerCase()))
  );
  const [playerStats, setPlayerStats] = useState(() => {
    const map = new Map();
    (existing?.playerStats || []).forEach(p => map.set(p.username.toLowerCase(), p));
    return map;
  });
  const [error, setError] = useState('');

  const approvedTeams = allTeams.filter(t => t.status === 'approved');
  const homeTeam = approvedTeams.find(t => t.id === matchInfo.homeTeamId);
  const awayTeam = approvedTeams.find(t => t.id === matchInfo.awayTeamId);

  // Players from selected teams
  const candidatePlayers = useMemo(() => {
    if (!matchInfo.homeTeamId && !matchInfo.awayTeamId) return [];
    const ids = new Set([matchInfo.homeTeamId, matchInfo.awayTeamId].filter(Boolean));
    return allPlayers.filter(p => ids.has(p.teamId));
  }, [allPlayers, matchInfo.homeTeamId, matchInfo.awayTeamId]);

  const toggleSelected = (username) => {
    const lc = username.toLowerCase();
    const next = new Set(selectedUsernames);
    if (next.has(lc)) next.delete(lc);
    else next.add(lc);
    setSelectedUsernames(next);
  };

  const updatePlayerStat = (username, field, value) => {
    const lc = username.toLowerCase();
    const map = new Map(playerStats);
    const existing = map.get(lc) || {};
    map.set(lc, { ...existing, [field]: value });
    setPlayerStats(map);
  };

  const goToStep2 = () => {
    setError('');
    if (!matchInfo.homeTeamId || !matchInfo.awayTeamId) { setError('Pick both teams'); return; }
    if (matchInfo.homeTeamId === matchInfo.awayTeamId) { setError('Teams must be different'); return; }
    setStep(2);
  };
  const goToStep3 = () => {
    setError('');
    if (selectedUsernames.size === 0) { setError('Pick at least one player'); return; }
    // Initialize blank stats for newly selected players
    const map = new Map(playerStats);
    for (const lc of selectedUsernames) {
      if (!map.has(lc)) {
        const player = allPlayers.find(p => p.username.toLowerCase() === lc);
        const baseStats = player?.position === 'GK'
          ? { deflects: 0, catches: 0, passes: 0, cleanSheet: false }
          : { goals: 0, assists: 0, passes: 0, tackles: 0 };
        map.set(lc, { username: player.username, position: player.position, ...baseStats });
      }
    }
    setPlayerStats(map);
    setStep(3);
  };

  const submit = async () => {
    setError('');
    const finalStats = Array.from(selectedUsernames).map(lc => playerStats.get(lc)).filter(Boolean);
    if (finalStats.length === 0) { setError('No players to submit'); return; }
    const sub = {
      id: existing?.id || `sub_${Math.random().toString(36).slice(2, 10)}`,
      status: 'pending',
      submittedBy: account.username,
      submittedAt: Date.now(),
      matchInfo,
      playerStats: finalStats,
    };
    await db.saveSubmission(sub);
    onSubmitted();
  };

  // ===== STEP 1: MATCH INFO =====
  if (step === 1) {
    return (
      <div className="space-y-4">
        <button onClick={onCancel} className="font-mono text-xs tracking-wider flex items-center gap-1" style={{ color: `${C.cream}88` }}>
          ← BACK
        </button>
        <div className="rounded-xl p-5" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}66` }}>
          <div className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: `${C.cream}66` }}>STEP 1 OF 3</div>
          <h4 className="font-display text-2xl tracking-wider mb-4" style={{ color: C.cream }}>WHEN AND WHO?</h4>

          <div className="space-y-4">
            <div>
              <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>MATCH DATE</label>
              <input
                type="date"
                value={(() => {
                  const d = new Date(matchInfo.date);
                  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                })()}
                onChange={(e) => {
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  setMatchInfo({ ...matchInfo, date: new Date(y, m - 1, d).getTime() });
                }}
                className="w-full rounded px-3 py-3 text-base"
                style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>HOME TEAM</label>
                <select
                  value={matchInfo.homeTeamId}
                  onChange={(e) => setMatchInfo({ ...matchInfo, homeTeamId: e.target.value })}
                  className="w-full rounded px-3 py-3 text-base"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
                >
                  <option value="" style={{ background: C.navyDeep }}>— select team —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>AWAY TEAM</label>
                <select
                  value={matchInfo.awayTeamId}
                  onChange={(e) => setMatchInfo({ ...matchInfo, awayTeamId: e.target.value })}
                  className="w-full rounded px-3 py-3 text-base"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
                >
                  <option value="" style={{ background: C.navyDeep }}>— select team —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>HOME SCORE</label>
                <BigNumberInput value={matchInfo.homeScore} onChange={(v) => setMatchInfo({ ...matchInfo, homeScore: v })} />
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>AWAY SCORE</label>
                <BigNumberInput value={matchInfo.awayScore} onChange={(v) => setMatchInfo({ ...matchInfo, awayScore: v })} />
              </div>
            </div>

            {error && <div className="font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

            <button
              onClick={goToStep2}
              className="w-full py-3 font-heading tracking-wider text-base rounded mt-2"
              style={{
                background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
                color: C.onColor,
                boxShadow: `0 4px 12px ${C.green}66`,
              }}
            >NEXT: PICK PLAYERS →</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== STEP 2: PICK PLAYERS =====
  if (step === 2) {
    const homePlayers = candidatePlayers.filter(p => p.teamId === matchInfo.homeTeamId);
    const awayPlayers = candidatePlayers.filter(p => p.teamId === matchInfo.awayTeamId);

    return (
      <div className="space-y-4">
        <button onClick={() => setStep(1)} className="font-mono text-xs tracking-wider flex items-center gap-1" style={{ color: `${C.cream}88` }}>
          ← BACK
        </button>
        <div className="rounded-xl p-5" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}66` }}>
          <div className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: `${C.cream}66` }}>STEP 2 OF 3</div>
          <h4 className="font-display text-2xl tracking-wider mb-1" style={{ color: C.cream }}>WHO PLAYED?</h4>
          <p className="font-mono text-[11px] tracking-wider mb-4" style={{ color: `${C.cream}77` }}>
            TAP A PLAYER TO ADD/REMOVE. SELECTED: {selectedUsernames.size}
          </p>

          {[
            { team: homeTeam, players: homePlayers, label: 'HOME' },
            { team: awayTeam, players: awayPlayers, label: 'AWAY' },
          ].map(({ team, players, label }) => (
            <div key={label} className="mb-4">
              <div className="font-mono text-[10px] tracking-[0.25em] mb-2" style={{ color: `${C.cream}88` }}>
                {label} • <span style={{ color: team?.color || C.cream }}>{team?.name?.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {players.length === 0 ? (
                  <div className="col-span-full font-mono text-xs italic" style={{ color: `${C.cream}55` }}>
                    No registered players on this team
                  </div>
                ) : players.map(p => {
                  const lc = p.username.toLowerCase();
                  const selected = selectedUsernames.has(lc);
                  return (
                    <button
                      key={p.username}
                      onClick={() => toggleSelected(p.username)}
                      className="rounded-lg p-3 text-left transition-all"
                      style={{
                        background: selected ? `${C.greenLight}22` : `${C.navyDeep}cc`,
                        border: `2px solid ${selected ? C.greenLight : C.navyLight + '44'}`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {selected && <CheckCircle size={14} style={{ color: C.greenLight }} />}
                        <div className="flex-1 min-w-0">
                          <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>
                            {p.username.toUpperCase()}
                          </div>
                          <div className="font-mono text-[10px]" style={{ color: `${C.cream}66` }}>
                            {p.position}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {error && <div className="font-mono text-xs px-2 py-1 rounded mb-2" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

          <button
            onClick={goToStep3}
            className="w-full py-3 font-heading tracking-wider text-base rounded"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 4px 12px ${C.green}66`,
            }}
          >NEXT: ENTER STATS →</button>
        </div>
      </div>
    );
  }

  // ===== STEP 3: PER-PLAYER STATS =====
  return (
    <div className="space-y-4">
      <button onClick={() => setStep(2)} className="font-mono text-xs tracking-wider flex items-center gap-1" style={{ color: `${C.cream}88` }}>
        ← BACK
      </button>
      <div className="rounded-xl p-5" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}66` }}>
        <div className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: `${C.cream}66` }}>STEP 3 OF 3</div>
        <h4 className="font-display text-2xl tracking-wider mb-1" style={{ color: C.cream }}>FILL IN STATS</h4>
        <p className="font-mono text-[11px] tracking-wider mb-4" style={{ color: `${C.cream}77` }}>
          USE THE +/− BUTTONS OR TAP A NUMBER TO TYPE IT
        </p>

        <div className="space-y-4">
          {Array.from(selectedUsernames).map(lc => {
            const stat = playerStats.get(lc);
            if (!stat) return null;
            const isGK = stat.position === 'GK';
            return (
              <div key={lc} className="rounded-lg p-3" style={{
                background: C.navyDeep, border: `1px solid ${C.navyLight}55`,
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="font-display text-lg tracking-wider" style={{ color: C.cream }}>
                    {stat.username.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px] tracking-wider px-2 py-0.5 rounded" style={{
                    background: `${C.brandNavy}cc`, color: C.cream,
                  }}>{stat.position}</div>
                </div>
                {isGK ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <StatField label="DEFLECTS"   value={stat.deflects}      onChange={(v) => updatePlayerStat(stat.username, 'deflects', v)} />
                    <StatField label="CATCHES" value={stat.catches}    onChange={(v) => updatePlayerStat(stat.username, 'catches', v)} />
                    <StatField label="PASSES"  value={stat.passes}     onChange={(v) => updatePlayerStat(stat.username, 'passes', v)} />
                    <ToggleField label="CLEAN SHEET" value={stat.cleanSheet} onChange={(v) => updatePlayerStat(stat.username, 'cleanSheet', v)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <StatField label="GOALS"    value={stat.goals}         onChange={(v) => updatePlayerStat(stat.username, 'goals', v)} />
                    <StatField label="ASSISTS"  value={stat.assists}       onChange={(v) => updatePlayerStat(stat.username, 'assists', v)} />
                    <StatField label="PASSES"   value={stat.passes}        onChange={(v) => updatePlayerStat(stat.username, 'passes', v)} />
                    <StatField label="TACKLES"  value={stat.tackles}       onChange={(v) => updatePlayerStat(stat.username, 'tackles', v)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <div className="font-mono text-xs px-2 py-1 rounded mt-3" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

        <button
          onClick={submit}
          className="w-full py-4 font-heading tracking-wider text-lg rounded mt-4"
          style={{
            background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLight} 100%)`,
            color: C.brandNavy,
            boxShadow: `0 4px 12px ${C.gold}88`,
          }}
        >SUBMIT FOR REVIEW →</button>
        <p className="font-mono text-[10px] tracking-wider text-center mt-2" style={{ color: `${C.cream}55` }}>
          ANOTHER ADMIN REVIEWS BEFORE STATS GO LIVE.
          <br />
          ONCE APPROVED, THE MATCH RESULT IS POSTED AUTOMATICALLY TO NEWS.
        </p>
      </div>
    </div>
  );
};

// Big +/- number input - much easier than typing on mobile
const BigNumberInput = ({ value, onChange, min = 0, max = 999 }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => onChange(Math.max(min, (parseInt(value, 10) || 0) - 1))}
      className="w-12 h-12 rounded font-display text-2xl flex items-center justify-center"
      style={{ background: `${C.brandNavy}cc`, color: C.cream, border: `1px solid ${C.navyLight}66` }}
    >−</button>
    <input
      type="number"
      value={value}
      min={min} max={max}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isNaN(v)) onChange(0);
        else onChange(Math.max(min, Math.min(max, v)));
      }}
      className="flex-1 rounded text-center font-display text-2xl py-2"
      style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
    />
    <button
      type="button"
      onClick={() => onChange(Math.min(max, (parseInt(value, 10) || 0) + 1))}
      className="w-12 h-12 rounded font-display text-2xl flex items-center justify-center"
      style={{ background: `${C.green}cc`, color: C.onColor, border: `1px solid ${C.greenLight}88` }}
    >+</button>
  </div>
);

const StatField = ({ label, value, onChange, hint }) => (
  <div>
    <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}aa` }}>
      {label}{hint && <span className="opacity-60 normal-case ml-1">{hint}</span>}
    </label>
    <BigNumberInput value={value || 0} onChange={onChange} />
  </div>
);

const ToggleField = ({ label, value, onChange }) => (
  <div>
    <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}aa` }}>{label}</label>
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full py-3 rounded font-heading tracking-wider text-sm"
      style={{
        background: value ? C.greenLight : `${C.navyDeep}`,
        color: value ? C.onColor : `${C.cream}77`,
        border: `1px solid ${value ? C.greenLight : C.navyLight}66`,
      }}
    >{value ? '✓ YES' : 'NO'}</button>
  </div>
);

// ============ REVIEW MATCH STATS ============
const ReviewMatchStats = ({ account, allPlayers, allTeams, submission, onBack }) => {
  // Allow inline editing of player stats during review
  const [editedStats, setEditedStats] = useState(() => {
    const map = new Map();
    submission.playerStats.forEach(p => map.set(p.username.toLowerCase(), { ...p }));
    return map;
  });
  const [editedMatchInfo, setEditedMatchInfo] = useState({ ...submission.matchInfo });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState([]); // log of changes

  const home = allTeams.find(t => t.id === submission.matchInfo.homeTeamId);
  const away = allTeams.find(t => t.id === submission.matchInfo.awayTeamId);

  const updateStat = (username, field, value) => {
    const lc = username.toLowerCase();
    const map = new Map(editedStats);
    const orig = submission.playerStats.find(p => p.username.toLowerCase() === lc);
    const oldVal = orig?.[field];
    map.set(lc, { ...map.get(lc), [field]: value });
    setEditedStats(map);
    if (oldVal !== value) {
      setEdits(es => [...es.filter(e => !(e.username === username && e.field === field)),
        { username, field, oldVal, newVal: value }]);
    }
  };

  const approve = async () => {
    setError(''); setBusy(true);
    try {
      // Apply stats to each player's account
      const finalStats = Array.from(editedStats.values());
      const matchId = `m_${Math.random().toString(36).slice(2, 10)}`;
      for (const ps of finalStats) {
        const player = await db.getAccount(ps.username);
        if (!player) continue;
        const isGK = ps.position === 'GK';
        // Build match record for this player
        const opponent = player.teamId === editedMatchInfo.homeTeamId
          ? (away?.name || 'Unknown')
          : (home?.name || 'Unknown');
        const isHome = player.teamId === editedMatchInfo.homeTeamId;
        const myScore = isHome ? editedMatchInfo.homeScore : editedMatchInfo.awayScore;
        const oppScore = isHome ? editedMatchInfo.awayScore : editedMatchInfo.homeScore;
        const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
        const matchRecord = {
          id: `${matchId}_${ps.username}`,
          date: editedMatchInfo.date,
          opponent,
          season: editedMatchInfo.season,
          result,
          goalsFor: myScore,
          goalsAgainst: oppScore,
          goals: ps.goals || 0,
          assists: ps.assists || 0,
          passes: ps.passes || 0,
          tackles: ps.tackles || 0,
          deflects: ps.deflects || 0,
          catches: ps.catches || 0,
          cleanSheet: !!ps.cleanSheet,
          motm: 0,
        };
        // Update season totals
        const oldStats = player.stats || {};
        const newStats = {
          ...oldStats,
          games: (oldStats.games || 0) + 1,
          wins: (oldStats.wins || 0) + (result === 'W' ? 1 : 0),
          draws: (oldStats.draws || 0) + (result === 'D' ? 1 : 0),
          losses: (oldStats.losses || 0) + (result === 'L' ? 1 : 0),
          goals: (oldStats.goals || 0) + (ps.goals || 0),
          assists: (oldStats.assists || 0) + (ps.assists || 0),
          passes: (oldStats.passes || 0) + (ps.passes || 0),
          tackles: (oldStats.tackles || 0) + (ps.tackles || 0),
          deflects: (oldStats.deflects || 0) + (ps.deflects || 0),
          catches: (oldStats.catches || 0) + (ps.catches || 0),
          cleanSheets: (oldStats.cleanSheets || 0) + (ps.cleanSheet ? 1 : 0),
        };
        const updated = { ...player, stats: newStats, matches: [...(player.matches || []), matchRecord] };
        await db.saveAccount(updated);
      }
      // Mark submission as approved
      await db.saveSubmission({
        ...submission,
        status: 'approved',
        reviewedBy: account.username,
        reviewedAt: Date.now(),
        edits,
        finalMatchInfo: editedMatchInfo,
        finalPlayerStats: Array.from(editedStats.values()),
      });
      // Auto-post a match result to NEWS so it appears in RESULTS tab
      // (unless one was already linked to this submission)
      const resultId = submission.linkedResultId || `n_result_${submission.id}`;
      await db.saveNews({
        id: resultId,
        type: 'result',
        homeTeamId: editedMatchInfo.homeTeamId,
        awayTeamId: editedMatchInfo.awayTeamId,
        homeScore: editedMatchInfo.homeScore,
        awayScore: editedMatchInfo.awayScore,
        date: editedMatchInfo.date,
        notes: '',
        author: account.username,
        createdAt: Date.now(),
        autoFromSubmission: submission.id,
      });
      onBack();
    } catch (e) {
      setError('Could not approve: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const reject = async () => {
    const reason = prompt('Why are you rejecting? (the submitter will see this)') || '';
    setBusy(true);
    try {
      await db.saveSubmission({
        ...submission,
        status: 'rejected',
        reviewedBy: account.username,
        reviewedAt: Date.now(),
        rejectionReason: reason,
      });
      onBack();
    } catch (e) {
      setError('Could not reject: ' + (e?.message || e));
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="font-mono text-xs tracking-wider flex items-center gap-1" style={{ color: `${C.cream}88` }}>
        ← BACK
      </button>

      <div className="rounded-xl p-5" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.gold}55` }}>
        <div className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: `${C.gold}cc` }}>REVIEW SUBMISSION</div>
        <div className="font-mono text-[11px] tracking-wider mb-3" style={{ color: `${C.cream}66` }}>
          SUBMITTED BY <span style={{ color: C.cream }}>{submission.submittedBy.toUpperCase()}</span> ON {new Date(submission.submittedAt).toLocaleString()}
        </div>

        {/* Match info display */}
        <div className="rounded-lg p-3 mb-4" style={{ background: C.navyDeep }}>
          <div className="font-mono text-[10px] tracking-[0.25em] mb-1" style={{ color: `${C.cream}66` }}>
            {new Date(editedMatchInfo.date).toLocaleDateString()} • {editedMatchInfo.season}
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <TeamPill team={home} fallback={editedMatchInfo.homeTeamId} />
            <span className="font-display text-2xl" style={{ color: C.cream }}>{editedMatchInfo.homeScore}</span>
            <span className="font-mono text-xs" style={{ color: `${C.cream}66` }}>—</span>
            <span className="font-display text-2xl" style={{ color: C.cream }}>{editedMatchInfo.awayScore}</span>
            <TeamPill team={away} fallback={editedMatchInfo.awayTeamId} />
          </div>
        </div>

        <div className="flex justify-between items-center mb-3">
          <div className="font-display text-lg tracking-wider" style={{ color: C.cream }}>PLAYER STATS</div>
          <button
            onClick={() => setEditing(e => !e)}
            className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded"
            style={{
              background: editing ? `${C.gold}22` : `${C.navyLight}66`,
              color: editing ? C.goldLight : C.cream,
              border: `1px solid ${editing ? C.gold : C.navyLight}66`,
            }}
          >{editing ? '✓ EDITING' : '✎ EDIT VALUES'}</button>
        </div>

        <div className="space-y-3 mb-4">
          {Array.from(editedStats.values()).map((ps) => {
            const isGK = ps.position === 'GK';
            return (
              <div key={ps.username} className="rounded-lg p-3" style={{
                background: C.navyDeep, border: `1px solid ${C.navyLight}55`,
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="font-display text-base tracking-wider" style={{ color: C.cream }}>
                    {ps.username.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px] px-2 py-0.5 rounded" style={{
                    background: `${C.brandNavy}cc`, color: C.cream,
                  }}>{ps.position}</div>
                </div>
                {editing ? (
                  isGK ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <StatField label="DEFLECTS"   value={ps.deflects}   onChange={(v) => updateStat(ps.username, 'deflects', v)} />
                      <StatField label="CATCHES" value={ps.catches} onChange={(v) => updateStat(ps.username, 'catches', v)} />
                      <StatField label="PASSES"  value={ps.passes}  onChange={(v) => updateStat(ps.username, 'passes', v)} />
                      <ToggleField label="CLEAN SHEET" value={ps.cleanSheet} onChange={(v) => updateStat(ps.username, 'cleanSheet', v)} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <StatField label="GOALS"   value={ps.goals}         onChange={(v) => updateStat(ps.username, 'goals', v)} />
                      <StatField label="ASSISTS" value={ps.assists}       onChange={(v) => updateStat(ps.username, 'assists', v)} />
                      <StatField label="PASSES"  value={ps.passes}        onChange={(v) => updateStat(ps.username, 'passes', v)} />
                      <StatField label="TACKLES" value={ps.tackles}       onChange={(v) => updateStat(ps.username, 'tackles', v)} />
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                    {isGK ? (
                      <>
                        <StatLine label="DFL" value={ps.deflects} />
                        <StatLine label="CATCH" value={ps.catches} />
                        <StatLine label="PASS"  value={ps.passes} />
                        <StatLine label="CS"    value={ps.cleanSheet ? '✓' : '—'} />
                      </>
                    ) : (
                      <>
                        <StatLine label="GOAL" value={ps.goals} />
                        <StatLine label="AST"  value={ps.assists} />
                        <StatLine label="PASS" value={ps.passes} />
                        <StatLine label="TKL"  value={ps.tackles} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {edits.length > 0 && (
          <div className="rounded-lg p-3 mb-3" style={{ background: `${C.gold}11`, border: `1px solid ${C.gold}44` }}>
            <div className="font-mono text-[10px] tracking-[0.25em] mb-1" style={{ color: C.goldLight }}>
              YOU EDITED {edits.length} {edits.length === 1 ? 'VALUE' : 'VALUES'}
            </div>
            <div className="space-y-0.5">
              {edits.map((e, i) => (
                <div key={i} className="font-mono text-[10px]" style={{ color: `${C.cream}99` }}>
                  {e.username} • {e.field}: <span style={{ color: C.redLight }}>{String(e.oldVal)}</span> → <span style={{ color: C.greenLight }}>{String(e.newVal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="font-mono text-xs px-2 py-1 rounded mb-3" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={reject}
            disabled={busy}
            className="py-3 font-heading tracking-wider text-sm rounded disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: `${C.red}33`,
              color: C.redLight,
              border: `1px solid ${C.red}66`,
            }}
          ><XCircle size={14} /> REJECT</button>
          <button
            onClick={approve}
            disabled={busy}
            className="py-3 font-heading tracking-wider text-sm rounded disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 2px 8px ${C.green}66`,
            }}
          ><CheckCircle size={14} /> {busy ? 'WORKING...' : 'APPROVE'}</button>
        </div>
      </div>
    </div>
  );
};

const StatLine = ({ label, value }) => (
  <div className="flex justify-between items-baseline px-2 py-1.5 rounded" style={{
    background: `${C.brandNavy}66`,
  }}>
    <span style={{ color: `${C.cream}77` }}>{label}</span>
    <span className="font-display text-sm" style={{ color: C.cream }}>{value}</span>
  </div>
);


// ============ TOTW MANAGER (admin: select Team of the Week) ============
// Picks one approved team to flag as Team of the Week. Every player on that
// team gets a TOTW marker on their card. Selecting a new team automatically
// unflags the previous one — only one TOTW at a time. Stays until manually
// changed (no auto-expiry).
// ============ TOTW MANAGER (admin: manage voting periods) ============
// Admin opens a voting period, picks eligible players, players vote, admin
// resolves the winners after voting closes. Each period auto-closes at
// midnight the day after it opens.
const TotwManager = ({ allPlayers = [], onRefresh }) => {
  const [periods, setPeriods] = useState([]);
  const [votes, setVotes] = useState([]);   // votes for the current open period
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState([]); // usernames
  const [filter, setFilter] = useState('');

  const refresh = async () => {
    try {
      const p = await db.listTotwPeriods();
      setPeriods(p);
      const open = p.find(x => x.status === 'open');
      if (open) {
        const v = await db.listTotwVotes(open.id);
        setVotes(v);
      } else {
        setVotes([]);
      }
    } catch (e) {
      setError('Could not load voting data: ' + (e?.message || e));
    }
  };

  useEffect(() => { refresh(); }, []);

  const currentPeriod = periods.find(p => p.status === 'open');
  const pastPeriods = periods.filter(p => p.status !== 'open').slice(0, 8);

  // Helper: midnight the day after opens_at
  const computeCloseTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  };

  // Vote tally for current period, grouped by position
  const tally = useMemo(() => {
    const counts = { GK: {}, DEF: {}, CM: {}, ST: {} };
    for (const v of votes) {
      if (!counts[v.position]) continue;
      counts[v.position][v.votedForUsername] = (counts[v.position][v.votedForUsername] || 0) + 1;
    }
    const sortPos = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return {
      GK: sortPos(counts.GK),
      DEF: sortPos(counts.DEF),
      CM: sortPos(counts.CM),
      ST: sortPos(counts.ST),
    };
  }, [votes]);

  const togglePlayer = (username) => {
    setSelectedPlayers(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  };

  const handleCreate = async () => {
    setError(''); setBusy(true);
    try {
      if (selectedPlayers.length < 8) {
        setError('Pick at least 8 eligible players (1 GK + 3 DEF + 2 CM + 2 ST minimum).');
        setBusy(false); return;
      }
      await db.createTotwPeriod({
        closesAt: computeCloseTime(),
        eligiblePlayers: selectedPlayers,
        createdBy: 'admin',
      });
      setInfo('✓ Voting period opened');
      setCreating(false);
      setSelectedPlayers([]);
      await refresh();
      onRefresh && onRefresh();
      setTimeout(() => setInfo(''), 4000);
    } catch (e) {
      setError('Could not create period: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const handleClose = async () => {
    if (!currentPeriod) return;
    if (!window.confirm('Close voting now? Voters won\'t be able to submit any more votes.')) return;
    setBusy(true);
    try {
      await db.updateTotwPeriod(currentPeriod.id, { status: 'closed' });
      setInfo('✓ Voting closed. Winners can be picked in Deploy 2.');
      await refresh();
      onRefresh && onRefresh();
      setTimeout(() => setInfo(''), 4000);
    } catch (e) {
      setError('Could not close period: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const handleDelete = async (periodId) => {
    if (!window.confirm('Delete this voting period? All votes will be lost.')) return;
    setBusy(true);
    try {
      await db.deleteTotwPeriod(periodId);
      setInfo('✓ Period deleted');
      await refresh();
      onRefresh && onRefresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (e) {
      setError('Could not delete: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const approvedPlayers = allPlayers
    .filter(p => !filter || p.username.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.username.localeCompare(b.username));

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, #2196f322 0%, ${C.white} 100%)`,
        border: `1px solid #2196f355`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={14} style={{ color: '#2196f3' }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>TEAM OF THE WEEK VOTING</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Open a voting period each week. Pick eligible players (anyone who played that week). Players vote 1 GK + 1 DEF + 1 CM + 1 ST. Voting auto-closes at midnight the next day. Admin picks the winners after voting closes.
        </p>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}
      {error && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>
      )}

      {/* CURRENT PERIOD */}
      <div className="rounded-lg p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div className="font-mono text-[10px] tracking-[0.25em] mb-2" style={{ color: `${C.brandNavy}77` }}>CURRENT VOTING PERIOD</div>
        {currentPeriod ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>
                  OPEN · CLOSES {new Date(currentPeriod.closesAt).toLocaleString()}
                </div>
                <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                  {currentPeriod.eligiblePlayers.length} ELIGIBLE PLAYERS · {votes.length} VOTES CAST
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={busy}
                className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                style={{ background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66` }}
              >CLOSE NOW</button>
            </div>

            {/* Live tally per position */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {['GK', 'DEF', 'CM', 'ST'].map(pos => (
                <div key={pos} className="rounded p-2" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}44` }}>
                  <div className="font-display text-xs tracking-wider mb-1" style={{ color: '#2196f3' }}>{pos}</div>
                  {tally[pos].length === 0 ? (
                    <div className="font-mono text-[9px]" style={{ color: `${C.cream}55` }}>NO VOTES YET</div>
                  ) : (
                    tally[pos].slice(0, 5).map(([username, count]) => (
                      <div key={username} className="flex justify-between gap-2 font-mono text-[10px] py-0.5" style={{ color: C.cream }}>
                        <span className="truncate">{username}</span>
                        <span style={{ color: `${C.cream}99` }}>{count}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="font-mono text-xs tracking-wider" style={{ color: `${C.brandNavy}66` }}>NO ACTIVE VOTING PERIOD</div>
            {!creating ? (
              <button
                onClick={() => { setCreating(true); setSelectedPlayers([]); }}
                className="w-full py-2 font-heading tracking-wider text-[11px] rounded"
                style={{ background: '#2196f3', color: '#fff' }}
              >OPEN NEW VOTING PERIOD</button>
            ) : (
              <div className="space-y-3">
                <div className="font-mono text-[10px] tracking-[0.2em]" style={{ color: `${C.brandNavy}77` }}>
                  PICK ELIGIBLE PLAYERS · {selectedPlayers.length} SELECTED
                </div>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search players…"
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
                />
                <div className="rounded max-h-64 overflow-y-auto" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66` }}>
                  {approvedPlayers.map(p => {
                    const checked = selectedPlayers.includes(p.username);
                    return (
                      <button
                        key={p.username}
                        type="button"
                        onClick={() => togglePlayer(p.username)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left"
                        style={{
                          borderBottom: `1px solid ${C.navyLight}33`,
                          background: checked ? `#2196f322` : 'transparent',
                        }}
                      >
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{
                          border: `1.5px solid ${checked ? '#2196f3' : `${C.cream}55`}`,
                          background: checked ? '#2196f3' : 'transparent',
                        }}>
                          {checked && <Check size={11} style={{ color: '#fff' }} />}
                        </div>
                        <span className="font-heading tracking-wider text-sm flex-1" style={{ color: C.cream }}>{p.username}</span>
                        <span className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}66` }}>{p.position}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCreating(false); setSelectedPlayers([]); }}
                    className="px-3 py-2 font-heading tracking-wider text-[11px] rounded"
                    style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                  >CANCEL</button>
                  <button
                    onClick={handleCreate}
                    disabled={busy || selectedPlayers.length < 8}
                    className="flex-1 py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                    style={{ background: '#2196f3', color: '#fff' }}
                  >{busy ? 'OPENING…' : `OPEN PERIOD (${selectedPlayers.length} PLAYERS)`}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PAST PERIODS */}
      {pastPeriods.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
          <div className="font-mono text-[10px] tracking-[0.25em] mb-2" style={{ color: `${C.brandNavy}77` }}>PAST PERIODS</div>
          <div className="space-y-1">
            {pastPeriods.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ background: C.navyDeep }}>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] tracking-wider" style={{ color: C.cream }}>
                    {p.status.toUpperCase()} · {new Date(p.opensAt).toLocaleDateString()}
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: `${C.cream}66` }}>
                    {p.eligiblePlayers.length} ELIGIBLE{p.winners ? ' · RESOLVED' : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="px-2 py-1 font-mono text-[9px] rounded"
                  style={{ background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}55` }}
                >DELETE</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


// ============ PLAYERS MANAGER (admin: rename players, change teams) ============
const PlayersManager = ({ allPlayers, allTeams = [], onRefresh }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);   // account being renamed
  const [newName, setNewName] = useState('');
  const [teamEditing, setTeamEditing] = useState(null); // account whose team is being changed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const approvedTeams = allTeams.filter(t => t.status === 'approved');
  const teamById = (id) => allTeams.find(t => t.id === id);

  const filtered = allPlayers
    .filter(p => !search || p.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.username.toLowerCase().localeCompare(b.username.toLowerCase()));

  const startEdit = (player) => {
    setEditing(player);
    setNewName(player.username);
    setError('');
  };

  const saveRename = async () => {
    setError('');
    const trimmed = newName.trim();
    if (trimmed === editing.username) { setEditing(null); return; }
    if (trimmed.length < 3) { setError('Must be at least 3 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setError('Letters, numbers, underscores only'); return; }
    // NOTE: admins bypass the profanity filter on purpose — they're the ones cleaning things up.
    setBusy(true);
    try {
      const result = await db.renameAccount(editing.id, trimmed);
      if (!result.ok) { setError(result.reason || 'Could not rename'); setBusy(false); return; }
      setInfo(`✓ Renamed to ${trimmed}`);
      setEditing(null);
      onRefresh && onRefresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (e) {
      setError('Could not rename: ' + (e?.message || e));
    }
    setBusy(false);
  };

  // Reassign (or remove) a player's team. newTeamId === '' means make them a
  // free agent. Keeps both the old and new teams' member arrays in sync.
  // Flag/unflag a player as a cheater. Just toggles the boolean — the visual
  // CHEATER stamp on their card appears wherever PlayerCard renders.
  const toggleCheater = async (player) => {
    const wasCheater = !!player.cheater;
    const label = wasCheater ? `Remove CHEATER flag from ${player.username}?` : `Flag ${player.username} as CHEATER? Their card will show a red diagonal CHEATER stamp.`;
    if (!window.confirm(label)) return;
    setError(''); setBusy(true);
    try {
      await db.saveAccount({ ...player, cheater: !wasCheater });
      onRefresh && onRefresh();
    } catch (e) {
      setError('Could not toggle cheater: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const changeTeam = async (player, newTeamId) => {
    setError('');
    setBusy(true);
    try {
      const oldTeamId = player.teamId || null;
      if (oldTeamId === (newTeamId || null)) { setTeamEditing(null); setBusy(false); return; }

      // 1. Remove from the old team's roster
      if (oldTeamId) {
        const oldTeam = teamById(oldTeamId);
        if (oldTeam) {
          await db.saveTeam({
            ...oldTeam,
            members: (oldTeam.members || []).filter(u => u.toLowerCase() !== player.username.toLowerCase()),
          });
        }
      }
      // 2. Add to the new team's roster (15-player cap)
      if (newTeamId) {
        const newTeam = teamById(newTeamId);
        if (newTeam) {
          const current = newTeam.members || [];
          const already = current.some(u => u.toLowerCase() === player.username.toLowerCase());
          if (!already) {
            if (current.length >= 15) {
              setError(`${newTeam.name} is already at the 15-player roster cap.`);
              setBusy(false);
              return;
            }
            await db.saveTeam({ ...newTeam, members: [...current, player.username] });
          }
        }
      }
      // 3. Update the player's teamId
      await db.saveAccount({ ...player, teamId: newTeamId || null });

      const label = newTeamId ? (teamById(newTeamId)?.name || 'team') : 'Free Agent';
      setInfo(`✓ ${player.username} → ${label}`);
      setTeamEditing(null);
      onRefresh && onRefresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (e) {
      setError('Could not change team: ' + (e?.message || e));
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
        border: `1px solid ${C.gold}55`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <User size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>MANAGE PLAYERS</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Rename a player or change their team — useful when someone leaves a squad or is removed. Players keep all their stats and awards.
        </p>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}
      {error && !editing && !teamEditing && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players…"
        className="w-full rounded px-3 py-2 text-sm"
        style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
      />

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="font-mono text-xs tracking-wider text-center py-4" style={{ color: `${C.cream}66` }}>
            NO PLAYERS FOUND
          </div>
        ) : filtered.map(p => {
          const playerTeam = p.teamId ? teamById(p.teamId) : null;
          return (
          <div key={p.id || p.username} className="rounded-lg p-3" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
            {editing && (editing.id === p.id) ? (
              <div className="space-y-2">
                <div className="font-mono text-[10px] tracking-[0.2em]" style={{ color: `${C.brandNavy}77` }}>
                  RENAMING — {p.username.toUpperCase()}
                </div>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  maxLength={20}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded px-3 py-2 font-heading tracking-wider"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
                />
                {error && <div className="font-mono text-[11px] px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.red }}>{error}</div>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditing(null); setError(''); }}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                    style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                  >CANCEL</button>
                  <button
                    onClick={saveRename}
                    disabled={busy}
                    className="flex-1 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                    style={{ background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`, color: C.onColor }}
                  >{busy ? 'SAVING…' : 'SAVE NEW NAME'}</button>
                </div>
              </div>
            ) : teamEditing && (teamEditing.id === p.id) ? (
              <div className="space-y-2">
                <div className="font-mono text-[10px] tracking-[0.2em]" style={{ color: `${C.brandNavy}77` }}>
                  CHANGE TEAM — {p.username.toUpperCase()}
                </div>
                <select
                  autoFocus
                  defaultValue={p.teamId || ''}
                  onChange={(e) => changeTeam(p, e.target.value)}
                  disabled={busy}
                  className="w-full rounded px-3 py-2 font-body text-sm"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
                >
                  <option value="">— Free Agent (no team) —</option>
                  {approvedTeams.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>
                  ))}
                </select>
                {error && <div className="font-mono text-[11px] px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.red }}>{error}</div>}
                <button
                  onClick={() => { setTeamEditing(null); setError(''); }}
                  className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                >CANCEL</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>
                    {p.username.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                    {p.position} • {p.stats?.games || 0} GAMES
                    {playerTeam
                      ? <span style={{ color: playerTeam.color || C.green }}> • {playerTeam.tag}</span>
                      : <span style={{ color: `${C.brandNavy}44` }}> • FREE AGENT</span>}
                  </div>
                </div>
                <button
                  onClick={() => { setTeamEditing(p); setEditing(null); setError(''); }}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1.5"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                ><Users size={11} /> TEAM</button>
                <button
                  onClick={() => startEdit(p)}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1.5"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                ><Edit3 size={11} /> RENAME</button>
                <button
                  onClick={() => toggleCheater(p)}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1.5"
                  style={p.cheater
                    ? { background: '#cc0000', color: '#fff', border: '1px solid #800000' }
                    : { background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}55` }
                  }
                >{p.cheater ? 'UNFLAG' : 'CHEATER'}</button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
};


// ============ PICTURES MANAGER (admin: approve player images) ============
const PicturesManager = ({ allPlayers, onRefresh }) => {
  const [busy, setBusy] = useState('');
  const [info, setInfo] = useState('');

  // Players who have a picture waiting for review
  const pending = allPlayers.filter(p => p.pendingImageUrl);

  const approve = async (player) => {
    setBusy(player.username); setInfo('');
    try {
      // The pending picture becomes the live picture
      const updated = { ...player, imageUrl: player.pendingImageUrl, pendingImageUrl: null };
      await db.saveAccount(updated);
      setInfo(`✓ ${player.username}'s picture approved`);
      onRefresh && onRefresh();
    } catch (e) {
      setInfo('Error: ' + (e?.message || e));
    }
    setBusy('');
    setTimeout(() => setInfo(''), 3000);
  };

  const reject = async (player) => {
    if (!confirm(`Reject ${player.username}'s new picture? Their current picture stays unchanged.`)) return;
    setBusy(player.username); setInfo('');
    try {
      // Discard the pending picture; live imageUrl untouched
      const updated = { ...player, pendingImageUrl: null };
      await db.saveAccount(updated);
      setInfo(`${player.username}'s picture rejected`);
      onRefresh && onRefresh();
    } catch (e) {
      setInfo('Error: ' + (e?.message || e));
    }
    setBusy('');
    setTimeout(() => setInfo(''), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
        border: `1px solid ${C.gold}55`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <User size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>PICTURE REVIEW</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          When a player uploads a new profile picture, it waits here for approval. Their old picture stays on their card until you approve the new one.
        </p>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}

      {pending.length === 0 ? (
        <div className="rounded-lg p-6 text-center" style={{ background: `${C.navyDeep}66`, border: `1px dashed ${C.navyLight}55` }}>
          <CheckCircle size={36} style={{ color: `${C.cream}44`, margin: '0 auto 8px' }} />
          <p className="font-mono text-xs tracking-wider" style={{ color: `${C.cream}66` }}>
            NO PICTURES WAITING FOR REVIEW
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(p => (
            <div key={p.username} className="rounded-xl p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
              <div className="font-display text-lg tracking-wider mb-3" style={{ color: C.brandNavy }}>
                {p.username.toUpperCase()} <span className="font-mono text-[11px]" style={{ color: `${C.brandNavy}66` }}>• {p.position}</span>
              </div>
              <div className="flex gap-4 flex-wrap">
                {/* Current picture */}
                <div className="text-center">
                  <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.brandNavy}66` }}>CURRENT</div>
                  <div style={{
                    width: 120, height: 120, borderRadius: 10, overflow: 'hidden',
                    background: `${C.navyDeep}22`, border: `1px solid ${C.navyLight}`,
                  }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="current" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User size={36} style={{ color: `${C.brandNavy}33` }} />
                      </div>
                    )}
                  </div>
                </div>
                {/* Pending picture */}
                <div className="text-center">
                  <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: C.goldLight }}>NEW (PENDING)</div>
                  <div style={{
                    width: 120, height: 120, borderRadius: 10, overflow: 'hidden',
                    background: `${C.navyDeep}22`, border: `2px solid ${C.goldLight}`,
                  }}>
                    <img src={p.pendingImageUrl} alt="pending" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-2 justify-center flex-1 min-w-[140px]">
                  <button
                    onClick={() => approve(p)}
                    disabled={busy === p.username}
                    className="py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
                      color: C.onColor, boxShadow: `0 2px 8px ${C.green}66`,
                    }}
                  ><CheckCircle size={14} /> {busy === p.username ? 'WORKING…' : 'APPROVE'}</button>
                  <button
                    onClick={() => reject(p)}
                    disabled={busy === p.username}
                    className="py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}
                  ><XCircle size={14} /> REJECT</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ============ WEIGHTINGS MANAGER (super-admin only) ============
// Lets super admins tune the per-position stat weights used for rankings.
const WeightingsManager = ({ onRefresh }) => {
  // Which stats apply to which position (must match DEFAULT_POSITION_WEIGHTS keys)
  // Strikers-Club stat set only — no shot%, interceptions, or pass accuracy.
  const POSITION_STATS = {
    ST:  ['goalsPerGame', 'assistsPerGame', 'passesPerGame', 'tacklesPerGame'],
    CM:  ['assistsPerGame', 'passesPerGame', 'goalsPerGame', 'tacklesPerGame'],
    DEF: ['tacklesPerGame', 'assistsPerGame', 'passesPerGame', 'goalsPerGame'],
    GK:  ['deflectsPerGame', 'cleanSheetPct', 'catchesPerGame'],
  };
  const POSITION_NAMES = { ST: 'STRIKER', CM: 'MIDFIELDER', DEF: 'DEFENDER', GK: 'GOALIE' };

  // weights stored as whole-number percentages (0-100) for the UI
  const [weights, setWeights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const saved = await db.getWeightings();
      // Convert from 0-1 decimals to 0-100 percentages for editing
      const source = saved || DEFAULT_POSITION_WEIGHTS;
      const asPct = {};
      for (const pos of Object.keys(POSITION_STATS)) {
        asPct[pos] = {};
        for (const stat of POSITION_STATS[pos]) {
          asPct[pos][stat] = Math.round((source[pos]?.[stat] || 0) * 100);
        }
      }
      setWeights(asPct);
      setLoading(false);
    })();
  }, []);

  const setStat = (pos, stat, value) => {
    const v = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
    setWeights(w => ({ ...w, [pos]: { ...w[pos], [stat]: v } }));
    setInfo(''); setError('');
  };

  const posTotal = (pos) => Object.values(weights[pos]).reduce((a, b) => a + b, 0);
  const allValid = () => Object.keys(POSITION_STATS).every(pos => posTotal(pos) === 100);

  const save = async () => {
    setError(''); setInfo('');
    if (!allValid()) {
      setError('Every position must add up to exactly 100% before saving.');
      return;
    }
    setSaving(true);
    try {
      // Convert back from 0-100 percentages to 0-1 decimals for storage
      const asDecimal = {};
      for (const pos of Object.keys(POSITION_STATS)) {
        asDecimal[pos] = {};
        for (const stat of POSITION_STATS[pos]) {
          asDecimal[pos][stat] = weights[pos][stat] / 100;
        }
      }
      await db.setWeightings(asDecimal);
      setInfo('✓ Weightings saved. Rankings will update.');
      onRefresh && onRefresh();
    } catch (e) {
      setError('Could not save: ' + (e?.message || e));
    }
    setSaving(false);
  };

  const resetToDefault = () => {
    if (!confirm('Reset all weightings back to the original defaults?')) return;
    const asPct = {};
    for (const pos of Object.keys(POSITION_STATS)) {
      asPct[pos] = {};
      for (const stat of POSITION_STATS[pos]) {
        asPct[pos][stat] = Math.round((DEFAULT_POSITION_WEIGHTS[pos]?.[stat] || 0) * 100);
      }
    }
    setWeights(asPct);
    setInfo('Defaults loaded — click Save to apply.');
  };

  if (loading || !weights) {
    return <div className="font-mono text-sm tracking-wider" style={{ color: `${C.cream}77` }}>Loading weightings…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
        border: `1px solid ${C.gold}55`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>STAT WEIGHTINGS</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          These control how each stat counts toward a player's ranking and tier. Each position must total exactly 100%. Changes apply to all rankings immediately after saving.
        </p>
      </div>

      {/* One card per position */}
      {Object.keys(POSITION_STATS).map(pos => {
        const total = posTotal(pos);
        const valid = total === 100;
        return (
          <div key={pos} className="rounded-xl p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>{POSITION_NAMES[pos]}</span>
              <span className="font-heading tracking-wider text-sm px-3 py-1 rounded" style={{
                background: valid ? `${C.green}22` : `${C.red}22`,
                color: valid ? C.green : C.red,
              }}>{total}% {valid ? '✓' : (total > 100 ? '— too high' : '— too low')}</span>
            </div>
            <div className="space-y-2">
              {POSITION_STATS[pos].map(stat => (
                <div key={stat} className="flex items-center gap-3">
                  <span className="font-body text-sm flex-1" style={{ color: C.brandNavy }}>
                    {STAT_KEY_LABELS[stat] || stat}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0" max="100"
                      value={weights[pos][stat]}
                      onChange={(e) => setStat(pos, stat, e.target.value)}
                      className="w-20 rounded text-center font-display text-lg py-1.5"
                      style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
                    />
                    <span className="font-mono text-sm" style={{ color: `${C.brandNavy}77` }}>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {error && <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>}
      {info && <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>}

      <div className="flex gap-3">
        <button
          onClick={resetToDefault}
          className="px-4 py-2.5 font-heading tracking-wider text-sm rounded"
          style={{ background: `${C.navyLight}66`, color: C.brandNavy, border: `1px solid ${C.navyLight}` }}
        >RESET TO DEFAULTS</button>
        <button
          onClick={save}
          disabled={saving || !allValid()}
          className="flex-1 py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50"
          style={{
            background: allValid() ? `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)` : C.navyLight,
            color: C.onColor,
            boxShadow: allValid() ? `0 2px 8px ${C.green}66` : 'none',
          }}
        >{saving ? 'SAVING…' : allValid() ? 'SAVE WEIGHTINGS' : 'FIX TOTALS TO SAVE'}</button>
      </div>
    </div>
  );
};


// ============ ADMINS MANAGER (super-admin only) ============
const AdminsManager = ({ account, allPlayers, dynamicAdmins, onRefresh }) => {
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Determine who's already an admin (super or dynamic)
  const lcDynamic = dynamicAdmins.map(a => a.toLowerCase());
  const allAdminUsernames = new Set([
    ...SUPER_ADMIN_USERNAMES,
    ...lcDynamic,
  ]);

  // Candidates: players not already admins
  const candidates = allPlayers
    .filter(p => !allAdminUsernames.has(p.username.toLowerCase()))
    .filter(p => !search || p.username.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20);

  const promote = async (username) => {
    setError(''); setInfo('');
    const lc = username.toLowerCase();
    if (allAdminUsernames.has(lc)) { setError('Already an admin'); return; }
    const next = [...dynamicAdmins, username];
    await db.setAdminList(next);
    setInfo(`✓ ${username} promoted to admin`);
    setPickerOpen(false);
    setSearch('');
    onRefresh();
    setTimeout(() => setInfo(''), 3000);
  };

  const demote = async (username) => {
    setError(''); setInfo('');
    const lc = username.toLowerCase();
    if (SUPER_ADMIN_USERNAMES.includes(lc)) {
      setError('Cannot remove super admin');
      return;
    }
    if (!confirm(`Remove ${username} as admin?`)) return;
    const next = dynamicAdmins.filter(a => a.toLowerCase() !== lc);
    await db.setAdminList(next);
    setInfo(`✓ ${username} demoted`);
    onRefresh();
    setTimeout(() => setInfo(''), 3000);
  };

  // Display list: super admins first, then dynamic admins
  const fullList = [
    ...SUPER_ADMIN_USERNAMES.map(u => ({ username: u, isSuper: true })),
    ...dynamicAdmins.map(u => ({ username: u, isSuper: false })),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
        border: `1px solid ${C.gold}55`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Crown size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>MANAGE ADMINS</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Admins can approve teams, submit/review stats, assign awards, and manage seasons. Super admins (yourself) additionally manage who is an admin.
        </p>
      </div>

      {/* Current admins list */}
      <div>
        <h4 className="font-display text-xl tracking-wider mb-3" style={{ color: C.brandNavy }}>
          CURRENT ADMINS ({fullList.length})
        </h4>
        <div className="space-y-2">
          {fullList.map(({ username, isSuper }) => (
            <div key={username} className="rounded-lg p-3 flex items-center gap-3" style={{
              background: C.white,
              border: `1px solid ${C.navyLight}`,
              borderLeft: `3px solid ${isSuper ? C.goldLight : C.green}`,
            }}>
              <Crown size={18} style={{ color: isSuper ? C.goldLight : C.green }} />
              <div className="flex-1 min-w-0">
                <div className="font-heading tracking-wider text-base" style={{ color: C.brandNavy }}>
                  {username.toUpperCase()}
                </div>
                <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.brandNavy}77` }}>
                  {isSuper ? 'SUPER ADMIN • CANNOT BE REMOVED' : 'REGULAR ADMIN'}
                </div>
              </div>
              {!isSuper && (
                <button
                  onClick={() => demote(username)}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded"
                  style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}
                >REMOVE</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Promote new admin */}
      <div className="rounded-xl p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <div className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>PROMOTE A PLAYER</div>
            <div className="font-mono text-[10px] tracking-wider mt-1" style={{ color: `${C.brandNavy}77` }}>
              ANY REGISTERED PLAYER CAN BE PROMOTED TO ADMIN
            </div>
          </div>
          <button
            onClick={() => setPickerOpen(o => !o)}
            className="px-4 py-2 font-heading tracking-wider text-xs rounded transition-all hover:scale-[1.02] flex items-center gap-2"
            style={{
              background: pickerOpen ? `${C.navyLight}66` : `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: pickerOpen ? C.brandNavy : C.onColor,
              boxShadow: pickerOpen ? 'none' : `0 2px 8px ${C.green}66`,
            }}
          >{pickerOpen ? <>CANCEL</> : <><Plus size={12} /> PROMOTE</>}</button>
        </div>

        {pickerOpen && (
          <div>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for a player..."
              className="w-full rounded px-3 py-2 mb-2 text-sm focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
            />
            {candidates.length === 0 ? (
              <div className="font-mono text-xs tracking-wider text-center py-4" style={{ color: `${C.brandNavy}66` }}>
                {search ? 'NO PLAYERS MATCH' : 'ALL PLAYERS ARE ALREADY ADMINS'}
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {candidates.map(p => (
                  <button
                    key={p.username}
                    onClick={() => promote(p.username)}
                    className="w-full rounded p-2.5 text-left transition-all hover:scale-[1.01] flex items-center gap-3"
                    style={{
                      background: `${C.navyLight}33`,
                      border: `1px solid ${C.navyLight}`,
                    }}
                  >
                    <User size={14} style={{ color: C.brandNavy }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>
                        {p.username.toUpperCase()}
                      </div>
                      <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                        {p.position} • {p.stats?.games || 0} GAMES
                      </div>
                    </div>
                    <div className="font-heading tracking-wider text-[10px] px-2 py-1 rounded" style={{
                      background: `${C.green}22`, color: C.green,
                    }}>PROMOTE →</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>}
      {info && <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>}
    </div>
  );
};


// ============ SHAREABLE CARD MODAL ============
// Renders the player card (an SVG) to a PNG entirely in-browser, with no
// external libraries: serialize the SVG, draw it onto a <canvas>, export.
const ShareableCardModal = ({ account, team, onClose }) => {
  const cardRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Core: turn the card's <svg> into a PNG blob via canvas.
  const renderCardToBlob = async () => {
    const container = cardRef.current;
    if (!container) throw new Error('Card not ready');
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('Card SVG not found');

    // Clone so we can safely set explicit width/height for rasterizing
    const clone = svg.cloneNode(true);
    const vb = svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : (svg.clientWidth || 320);
    const h = vb && vb.height ? vb.height : (svg.clientHeight || 510);
    const scale = 3; // retina-quality export
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Any <image> pointing at an external URL (e.g. the country flag from
    // flagcdn) would taint the canvas and block PNG export. Convert those to
    // inline data URIs first. Data-URI images (logo, uploaded photo) are left
    // as-is.
    const toDataUri = async (src) => {
      const resp = await fetch(src, { mode: 'cors' });
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    };
    const imgEls = Array.from(clone.querySelectorAll('image'));
    await Promise.all(imgEls.map(async (el) => {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (href && !href.startsWith('data:')) {
        try {
          const dataUri = await toDataUri(href);
          el.setAttribute('href', dataUri);
          el.removeAttribute('xlink:href');
        } catch (e) {
          // If a flag fails to inline, drop it rather than break the whole export
          el.remove();
        }
      }
    }));

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Could not load card image'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Export failed')), 'image/png');
      });
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(''); setInfo('');
    try {
      const blob = await renderCardToBlob();
      const link = document.createElement('a');
      link.download = `${account.username}-ASL-card.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setInfo('Card downloaded!');
    } catch (e) {
      setError(e?.message || 'Could not generate image. Try again.');
    }
    setDownloading(false);
  };

  const handleCopyLink = async () => {
    setError(''); setInfo('');
    const url = `${window.location.origin}${window.location.pathname}?player=${encodeURIComponent(account.username)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError('Could not copy link.');
    }
  };

  const handleNativeShare = async () => {
    setError(''); setInfo('');
    // If the device supports native sharing of files, share the PNG directly.
    if (!navigator.share) {
      return handleDownload();
    }
    setDownloading(true);
    try {
      const blob = await renderCardToBlob();
      const file = new File([blob], `${account.username}-ASL-card.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${account.username} — ASL Player Card`,
          text: `Check out my ASL player card!`,
        });
      } else {
        await handleDownload();
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError('Could not share. Try downloading instead.');
      }
    }
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{
      background: `${C.black}dd`, backdropFilter: 'blur(8px)',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-4 fade-in">
        <PlayerCard ref={cardRef} account={account} size="lg" team={team} />

        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={handleNativeShare}
            disabled={downloading}
            className="px-4 py-2 rounded font-heading text-xs tracking-wider flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 4px 12px ${C.green}66`,
            }}
          >
            <Share2 size={14} /> {downloading ? 'GENERATING...' : 'SHARE CARD'}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="px-4 py-2 rounded font-heading text-xs tracking-wider flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
            style={{
              background: C.white, color: C.brandNavy,
              boxShadow: `0 4px 12px ${C.black}33`,
            }}
          >
            <Download size={14} /> DOWNLOAD
          </button>
          <button
            onClick={handleCopyLink}
            className="px-4 py-2 rounded font-heading text-xs tracking-wider flex items-center gap-2 transition-all hover:scale-105"
            style={{
              background: C.white, color: C.brandNavy,
              boxShadow: `0 4px 12px ${C.black}33`,
            }}
          >
            {copied ? <><Check size={14} /> COPIED</> : <><Copy size={14} /> COPY LINK</>}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded font-mono text-xs tracking-wider" style={{
            background: `${C.navyLight}55`, color: C.white,
          }}>CLOSE</button>
        </div>

        {error && (
          <div className="font-mono text-xs px-3 py-1.5 rounded" style={{
            background: `${C.brandNavy}cc`, color: C.white, border: `1px solid ${C.navyLight}66`,
          }}>{error}</div>
        )}
        {info && !error && (
          <div className="font-mono text-xs px-3 py-1.5 rounded" style={{
            background: `${C.green}cc`, color: C.white, border: `1px solid ${C.greenLight}66`,
          }}>{info}</div>
        )}
      </div>
    </div>
  );
};

// ============ TIER PREVIEW (debug/showcase) ============
const TierPreview = () => {
  // Build one fake account per tier with stats tuned to land in that overall range
  const mkAccount = (username, position, targetOverall, awards = []) => {
    // Backsolve simple stats that produce roughly the right OVR
    const isGK = position === 'GK';
    const games = 15;
    let stats;
    if (targetOverall >= 87) {
      stats = isGK
        ? { games, wins: 13, draws: 2, losses: 0, goals: 0, assists: 0, passes: 16, tackles: 0, deflects: 95, cleanSheets: 13, catches: 30, motm: 0 }
        : { games, wins: 12, draws: 2, losses: 1, goals: 38, assists: 22, passes: 36, tackles: 22, deflects: 0, cleanSheets: 0, catches: 0, motm: 0 };
    } else if (targetOverall >= 78) {
      stats = { games, wins: 9, draws: 3, losses: 3, goals: 18, assists: 11, passes: 32, tackles: 38, deflects: 0, cleanSheets: 4, catches: 0, motm: 0 };
    } else if (targetOverall >= 68) {
      stats = { games, wins: 7, draws: 3, losses: 5, goals: 8, assists: 6, passes: 24, tackles: 22, deflects: 0, cleanSheets: 2, catches: 0, motm: 0 };
    } else {
      stats = { games, wins: 4, draws: 3, losses: 8, goals: 3, assists: 2, passes: 18, tackles: 12, deflects: 0, cleanSheets: 1, catches: 0, motm: 0 };
    }
    return { username, position, stats, awards, matches: [], imageUrl: null, country: null };
  };

  const samples = [
    { account: mkAccount('Rookie',     'ST',  60), label: 'BRONZE',  desc: 'Bottom 40% of position', forceTier: 'BRONZE' },
    { account: mkAccount('Solid',      'CM',  72), label: 'SILVER',  desc: 'Next 30% (40th–70th %ile)', forceTier: 'SILVER' },
    { account: { ...mkAccount('Vet',   'DEF', 80), country: 'Canada' }, label: 'GOLD', desc: 'Country flag shows on the card', forceTier: 'GOLD' },
    { account: mkAccount('Champion',   'ST',  90, [
      { awardId: 'striker', season: 'S1', assignedBy: 'admin', assignedAt: Date.now() },
    ]), label: 'DIAMOND + AWARD', desc: 'Award winners get a black name bar', forceTier: 'DIAMOND' },
    { account: mkAccount('Decorated',  'CM',  72, [
      { awardId: 'playmaker', season: 'S1', assignedBy: 'admin', assignedAt: Date.now() },
    ]), label: 'SILVER + AWARD', desc: 'Black name bar shows on any tier', forceTier: 'SILVER' },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>TIER PREVIEW</h3>
      </div>
      <p className="font-body text-sm mb-6" style={{ color: `${C.cream}aa` }}>
        Each tier rendered with its material treatment. Award winners get a black bar behind their name in the tier's accent color. The Gold card shows how a player's country flag appears below the team logo.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center">
        {samples.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <PlayerCard account={s.account} size="md" hideTeam forceTier={s.forceTier} />
            <div className="text-center">
              <div className="font-display text-xl tracking-wider" style={{ color: C.cream }}>{s.label}</div>
              <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.cream}66` }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ HOME (LANDING PAGE) ============
const HomeView = ({ account, allPlayers, allTeams, rankings, currentSeason, onJump, onUpdate }) => {
  const [news, setNews] = useState([]);
  const [addingEmail, setAddingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [editingCountry, setEditingCountry] = useState(false);
  const [countryInput, setCountryInput] = useState('');
  const [countryBusy, setCountryBusy] = useState(false);
  const [countryMsg, setCountryMsg] = useState('');
  useEffect(() => {
    db.listNews().then(setNews);
  }, []);

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

  // Existing accounts created before the email feature can add one here.
  const handleSaveEmail = async () => {
    setEmailMsg('');
    if (!isValidEmail(emailInput)) { setEmailMsg('Please enter a valid email address'); return; }
    setEmailBusy(true);
    try {
      const updated = { ...account, email: emailInput.trim().toLowerCase() };
      await db.saveAccount(updated);
      onUpdate && onUpdate(updated);
      setAddingEmail(false);
      setEmailMsg('');
    } catch (e) {
      setEmailMsg('Could not save email: ' + (e?.message || e));
    }
    setEmailBusy(false);
  };

  // Country picker — players who registered before the country field existed,
  // or who want to change theirs, can set it from here.
  const handleSaveCountry = async () => {
    setCountryMsg('');
    if (!countryInput) { setCountryMsg('Please pick a country'); return; }
    setCountryBusy(true);
    try {
      const updated = { ...account, country: countryInput };
      await db.saveAccount(updated);
      onUpdate && onUpdate(updated);
      setEditingCountry(false);
      setCountryMsg('');
    } catch (e) {
      setCountryMsg('Could not save country: ' + (e?.message || e));
    }
    setCountryBusy(false);
  };

  const myTeam = allTeams.find(t => t.id === account.teamId && t.status === 'approved');
  const myRanking = getPlayerRanking(account, rankings);

  const announcements = news.filter(n => n.type === 'announcement').sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    return b.createdAt - a.createdAt;
  }).slice(0, 3);

  const upcomingMatchups = news.filter(n => n.type === 'matchup' && n.date >= Date.now())
    .sort((a, b) => a.date - b.date).slice(0, 3);

  const recentResults = news.filter(n => n.type === 'result')
    .sort((a, b) => b.date - a.date).slice(0, 3);

  // Top 3 players this season per leaderboard score
  const topPlayers = [...allPlayers]
    .map(p => ({ player: p, score: getPlayerRanking(p, rankings).score, ranked: getPlayerRanking(p, rankings).ranked }))
    .filter(x => x.ranked)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const teamById = (id) => allTeams.find(t => t.id === id);

  return (
    <div className="space-y-8">
      {/* HERO */}
      <div className="rounded-2xl overflow-hidden relative" style={{
        background: `linear-gradient(135deg, ${C.brandNavy} 0%, ${C.brandNavyDeep} 100%)`,
        boxShadow: `0 8px 28px ${C.brandNavy}33`,
      }}>
        {/* Subtle pitch lines */}
        <div className="absolute inset-0 pitch-lines opacity-15 pointer-events-none" />
        {/* Diagonal accent */}
        <div className="absolute pointer-events-none" style={{
          top: 0, right: 0, width: '40%', height: '100%',
          background: `linear-gradient(120deg, transparent 50%, ${C.green}33 60%, ${C.green}55 75%, transparent 90%)`,
        }} />
        <div className="relative px-6 py-10 md:py-14 md:px-10">
          <div className="font-mono text-[10px] tracking-[0.4em] mb-2" style={{ color: `${C.white}99` }}>
            // SEASON {currentSeason} • OFFICIAL LEAGUE HUB
          </div>
          <h1 className="font-display tracking-tight leading-[0.9]" style={{
            fontSize: 'clamp(36px, 8vw, 68px)',
            color: C.white,
          }}>
            WELCOME BACK,<br />
            <span style={{ color: C.goldLight }}>{account.username.toUpperCase()}</span>
          </h1>
          <p className="font-body mt-3 max-w-md" style={{ color: `${C.white}cc`, fontSize: 16 }}>
            Alliance Strikers League — your official Pro Soccer Online community. Track your career, follow the league, climb the ranks.
          </p>
          <div className="flex gap-3 mt-6 flex-wrap">
            <button
              onClick={() => onJump('me')}
              className="px-5 py-2.5 font-heading tracking-wider text-sm rounded transition-all hover:scale-[1.02] flex items-center gap-2"
              style={{
                background: C.white, color: C.brandNavy,
                boxShadow: `0 4px 12px ${C.brandNavyDeep}55`,
              }}
            ><User size={14} /> MY PLAYER CARD</button>
            <button
              onClick={() => onJump('news')}
              className="px-5 py-2.5 font-heading tracking-wider text-sm rounded transition-all flex items-center gap-2"
              style={{
                background: 'transparent', color: C.white,
                border: `1px solid ${C.white}66`,
              }}
            ><Flag size={14} /> LATEST NEWS</button>
          </div>
        </div>
      </div>

      {/* QUICK STATS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStat label="YOUR TIER" value={myRanking.ranked ? tierFromPercentile(myRanking.percentile) : '—'} accent={C.goldLight} />
        <QuickStat label="GAMES PLAYED" value={account.stats?.games || 0} accent={C.green} />
        <QuickStat label="LEAGUE PLAYERS" value={allPlayers.length} accent={C.brandNavy} />
        <QuickStat label="ACTIVE TEAMS" value={allTeams.filter(t => t.status === 'approved').length} accent={C.red} />
      </div>

      {/* MY PROFILE — email + country */}
      <div className="rounded-2xl p-5" style={{
        background: C.white,
        border: `1px solid ${C.navyLight}`,
        boxShadow: `0 4px 16px ${C.brandNavy}11`,
      }}>
        <div className="flex items-center gap-2 mb-4">
          <User size={15} style={{ color: C.green }} />
          <span className="font-display text-lg tracking-wider" style={{ color: C.brandNavy }}>MY PROFILE</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* EMAIL */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.brandNavy}88` }}>EMAIL</div>
            {account.email && !addingEmail ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-body text-sm" style={{ color: C.brandNavy }}>{account.email}</span>
                <button
                  onClick={() => { setAddingEmail(true); setEmailInput(account.email); }}
                  className="font-mono text-[10px] tracking-wider"
                  style={{ color: C.green, textDecoration: 'underline' }}
                >CHANGE</button>
              </div>
            ) : addingEmail ? (
              <div className="space-y-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 font-body text-sm focus:outline-none rounded"
                  style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEmail}
                    disabled={emailBusy}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                    style={{ background: C.green, color: C.onColor }}
                  >{emailBusy ? 'SAVING...' : 'SAVE'}</button>
                  <button
                    onClick={() => { setAddingEmail(false); setEmailMsg(''); }}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                    style={{ background: 'transparent', color: `${C.brandNavy}99`, border: `1px solid ${C.navyLight}` }}
                  >CANCEL</button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="font-body text-sm italic" style={{ color: `${C.brandNavy}66` }}>No email on file</div>
                <button
                  onClick={() => { setAddingEmail(true); setEmailInput(''); }}
                  className="font-mono text-[11px] tracking-wider"
                  style={{ color: C.green, textDecoration: 'underline' }}
                >+ Add an email (enables password reset)</button>
              </div>
            )}
            {emailMsg && (
              <div className="font-mono text-[11px] mt-1" style={{ color: C.red }}>{emailMsg}</div>
            )}
          </div>
          {/* COUNTRY */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.brandNavy}88` }}>COUNTRY</div>
            {account.country && !editingCountry ? (
              <div className="flex items-center gap-2 flex-wrap">
                {flagUrl(account.country) && (
                  <img src={flagUrl(account.country)} alt="" style={{ width: 24, height: 16, objectFit: 'cover', borderRadius: 2, border: `1px solid ${C.navyLight}` }} />
                )}
                <span className="font-body text-sm" style={{ color: C.brandNavy }}>{account.country}</span>
                <button
                  onClick={() => { setEditingCountry(true); setCountryInput(account.country || ''); }}
                  className="font-mono text-[10px] tracking-wider"
                  style={{ color: C.green, textDecoration: 'underline' }}
                >CHANGE</button>
              </div>
            ) : editingCountry ? (
              <div className="space-y-2">
                <select
                  value={countryInput}
                  onChange={(e) => setCountryInput(e.target.value)}
                  className="w-full px-3 py-2 font-body text-sm focus:outline-none rounded"
                  style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
                >
                  <option value="">— Select a country —</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveCountry}
                    disabled={countryBusy}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                    style={{ background: C.green, color: C.onColor }}
                  >{countryBusy ? 'SAVING...' : 'SAVE'}</button>
                  <button
                    onClick={() => { setEditingCountry(false); setCountryMsg(''); }}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                    style={{ background: 'transparent', color: `${C.brandNavy}99`, border: `1px solid ${C.navyLight}` }}
                  >CANCEL</button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="font-body text-sm italic" style={{ color: `${C.brandNavy}66` }}>Not set</div>
                <button
                  onClick={() => { setEditingCountry(true); setCountryInput(''); }}
                  className="font-mono text-[11px] tracking-wider"
                  style={{ color: C.green, textDecoration: 'underline' }}
                >+ Set your country</button>
              </div>
            )}
            {countryMsg && (
              <div className="font-mono text-[11px] mt-1" style={{ color: C.red }}>{countryMsg}</div>
            )}
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* LEFT: Pinned announcements + recent news */}
        <div className="lg:col-span-2 space-y-6">
          {announcements.length > 0 && (
            <Section title="LATEST FROM THE LEAGUE" onMore={() => onJump('news')}>
              <div className="space-y-3">
                {announcements.map(a => (
                  <ArticleCard key={a.id}
                    title={a.title}
                    body={a.body}
                    pinned={a.pinned}
                    date={a.createdAt}
                    author={a.author}
                  />
                ))}
              </div>
            </Section>
          )}

          {recentResults.length > 0 && (
            <Section title="RECENT RESULTS" onMore={() => onJump('news')}>
              <div className="space-y-2">
                {recentResults.map(r => (
                  <ResultRow key={r.id} r={r} home={teamById(r.homeTeamId)} away={teamById(r.awayTeamId)} />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* RIGHT: Upcoming + top players */}
        <div className="space-y-6">
          {upcomingMatchups.length > 0 && (
            <Section title="UPCOMING">
              <div className="space-y-2">
                {upcomingMatchups.map(m => {
                  const home = teamById(m.homeTeamId);
                  const away = teamById(m.awayTeamId);
                  return (
                    <div key={m.id} className="rounded-lg p-3" style={{
                      background: C.white,
                      border: `1px solid ${C.navyLight}`,
                    }}>
                      <div className="font-mono text-[9px] tracking-[0.25em] mb-1.5" style={{ color: C.green }}>
                        {new Date(m.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()} • {new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading text-sm tracking-wider" style={{ color: C.brandNavy }}>{home?.name || '?'}</span>
                        <span className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>VS</span>
                        <span className="font-heading text-sm tracking-wider" style={{ color: C.brandNavy }}>{away?.name || '?'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {topPlayers.length > 0 && (
            <Section title="TOP RANKED" onMore={() => onJump('leaderboard')}>
              <div className="space-y-2">
                {topPlayers.map(({ player, score }, i) => (
                  <div key={player.username} className="rounded-lg p-3 flex items-center gap-3" style={{
                    background: C.white,
                    border: `1px solid ${C.navyLight}`,
                  }}>
                    <div className="font-display text-2xl" style={{ color: i === 0 ? C.goldLight : C.brandNavy, minWidth: 28 }}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.brandNavy }}>
                        {player.username.toUpperCase()}
                      </div>
                      <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                        {player.position} • {player.stats?.games || 0} GAMES
                      </div>
                    </div>
                    <div className="font-display text-xl" style={{ color: C.brandNavy }}>{score}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

const QuickStat = ({ label, value, accent }) => (
  <div className="rounded-lg p-4" style={{
    background: C.white,
    border: `1px solid ${C.navyLight}`,
    borderTop: `3px solid ${accent}`,
  }}>
    <div className="font-mono text-[10px] tracking-[0.25em]" style={{ color: `${C.brandNavy}77` }}>
      {label}
    </div>
    <div className="font-display text-2xl tracking-wider mt-1" style={{ color: C.brandNavy }}>
      {value}
    </div>
  </div>
);

const Section = ({ title, children, onMore }) => (
  <div>
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-display text-2xl tracking-wider" style={{ color: C.brandNavy }}>{title}</h3>
      {onMore && (
        <button onClick={onMore} className="font-mono text-[10px] tracking-[0.25em] flex items-center gap-1" style={{ color: C.green }}>
          MORE <ChevronRight size={12} />
        </button>
      )}
    </div>
    {children}
  </div>
);

const ArticleCard = ({ title, body, pinned, date, author }) => (
  <article className="rounded-xl p-5 transition-all hover:translate-y-[-1px]" style={{
    background: C.white,
    border: `1px solid ${pinned ? C.gold + '88' : C.navyLight}`,
    borderLeft: `4px solid ${pinned ? C.goldLight : C.green}`,
    boxShadow: `0 2px 8px ${C.brandNavy}11`,
  }}>
    <div className="flex items-center gap-2 mb-2">
      {pinned && <Star size={11} style={{ color: C.goldLight }} />}
      <div className="font-mono text-[10px] tracking-[0.25em]" style={{ color: pinned ? C.goldLight : C.green }}>
        {pinned ? 'PINNED' : 'ANNOUNCEMENT'}
      </div>
    </div>
    <h4 className="font-display text-2xl tracking-wider mb-2" style={{ color: C.brandNavy, lineHeight: 1.1 }}>
      {title}
    </h4>
    <p className="font-body text-sm mb-3" style={{ color: `${C.brandNavy}cc`, lineHeight: 1.6 }}>
      {body.length > 180 ? body.slice(0, 180) + '…' : body}
    </p>
    <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.brandNavy}66` }}>
      BY {(author || 'admin').toUpperCase()} • {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}
    </div>
  </article>
);

const ResultRow = ({ r, home, away }) => {
  const homeWon = r.homeScore > r.awayScore;
  const awayWon = r.awayScore > r.homeScore;
  return (
    <div className="rounded-lg px-4 py-3 flex items-center gap-3" style={{
      background: C.white,
      border: `1px solid ${C.navyLight}`,
    }}>
      <div className="font-mono text-[9px] tracking-[0.25em] w-14 flex-shrink-0" style={{ color: `${C.brandNavy}66` }}>
        {new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}
      </div>
      <div className="flex-1 flex items-center justify-center gap-2 flex-wrap">
        <span className="font-heading text-sm tracking-wider text-right" style={{
          color: homeWon ? C.brandNavy : `${C.brandNavy}88`,
          fontWeight: homeWon ? 700 : 400,
          minWidth: 80,
        }}>{home?.name || '?'}</span>
        <span className="font-display text-xl px-2" style={{
          color: homeWon ? C.green : (awayWon ? `${C.brandNavy}66` : C.brandNavy),
        }}>{r.homeScore}</span>
        <span className="font-mono text-xs" style={{ color: `${C.brandNavy}55` }}>—</span>
        <span className="font-display text-xl px-2" style={{
          color: awayWon ? C.green : (homeWon ? `${C.brandNavy}66` : C.brandNavy),
        }}>{r.awayScore}</span>
        <span className="font-heading text-sm tracking-wider" style={{
          color: awayWon ? C.brandNavy : `${C.brandNavy}88`,
          fontWeight: awayWon ? 700 : 400,
          minWidth: 80,
        }}>{away?.name || '?'}</span>
      </div>
    </div>
  );
};

// ============ NEWS VIEW ============
const NewsView = ({ account, allTeams, dynamicAdmins = [] }) => {
  const [subtab, setSubtab] = useState('matchups');
  const [news, setNews] = useState([]);
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState(null);

  const refresh = async () => {
    setNews(await db.listNews());
  };
  useEffect(() => { refresh(); }, []);

  const teamById = (id) => allTeams.find(t => t.id === id);

  const matchups     = news.filter(n => n.type === 'matchup').sort((a, b) => a.date - b.date);
  const announcements = news.filter(n => n.type === 'announcement').sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    return b.createdAt - a.createdAt;
  });
  const results      = news.filter(n => n.type === 'result').sort((a, b) => b.date - a.date);

  const handleDelete = async (id) => {
    if (!confirm('Delete this news item?')) return;
    await db.deleteNews(id);
    refresh();
  };
  const handleEdit = (item) => {
    setEditing(item);
    setShowCompose(true);
  };

  const isAdminUser = isAdmin(account, dynamicAdmins);

  const subtabs = [
    { id: 'matchups',      label: `MATCHUPS (${matchups.length})`,           icon: Calendar },
    { id: 'announcements', label: `ANNOUNCEMENTS (${announcements.length})`, icon: Flag },
    { id: 'results',       label: `RESULTS (${results.length})`,             icon: Trophy },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Flag size={22} style={{ color: C.goldLight }} />
          <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>NEWS</h3>
        </div>
        {isAdminUser && (
          <button
            onClick={() => { setEditing(null); setShowCompose(true); }}
            className="px-3 py-1.5 font-heading tracking-wider text-xs flex items-center gap-1.5 rounded transition-all hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor, boxShadow: `0 2px 8px ${C.green}66`,
            }}
          ><Plus size={12} /> NEW POST</button>
        )}
      </div>

      {/* SUBTABS */}
      <div className="flex gap-1 mb-5 p-1 rounded" style={{ background: `${C.navyDeep}88` }}>
        {subtabs.map(s => {
          const active = subtab === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSubtab(s.id)}
              className="flex-1 px-3 py-2 font-heading tracking-wider text-[10px] sm:text-[11px] rounded transition-all flex items-center justify-center gap-1.5"
              style={{
                background: active ? `${C.goldLight}22` : 'transparent',
                color: active ? C.goldLight : `${C.cream}88`,
                border: `1px solid ${active ? C.goldLight : 'transparent'}66`,
              }}
            ><s.icon size={12} /> {s.label}</button>
          );
        })}
      </div>

      {/* MATCHUPS */}
      {subtab === 'matchups' && (
        matchups.length === 0
          ? <EmptyState icon={<Calendar size={40} />} text="No matchups posted yet." />
          : <div className="space-y-2">
              {matchups.map(m => {
                const home = teamById(m.homeTeamId);
                const away = teamById(m.awayTeamId);
                const upcoming = m.date >= Date.now();
                return (
                  <div key={m.id} className="rounded-lg p-4" style={{
                    background: `${C.navyDeep}aa`,
                    border: `1px solid ${C.navyLight}44`,
                    borderLeft: `3px solid ${upcoming ? C.greenLight : C.navyLight}`,
                  }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="font-mono text-[10px] tracking-[0.25em] mb-1" style={{ color: upcoming ? C.greenLight : `${C.cream}66` }}>
                          {upcoming ? 'UPCOMING' : 'PAST'} • {new Date(m.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <TeamPill team={home} fallback={m.homeTeamId} />
                          <span className="font-display text-xl" style={{ color: `${C.cream}77` }}>VS</span>
                          <TeamPill team={away} fallback={m.awayTeamId} />
                        </div>
                        {m.notes && <p className="font-body text-sm mt-2" style={{ color: `${C.cream}cc` }}>{m.notes}</p>}
                      </div>
                      {isAdminUser && (
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(m)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.navyLight}66`, color: C.cream }}>EDIT</button>
                          <button onClick={() => handleDelete(m.id)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.red}33`, color: C.redLight }}>DEL</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
      )}

      {/* ANNOUNCEMENTS */}
      {subtab === 'announcements' && (
        announcements.length === 0
          ? <EmptyState icon={<Flag size={40} />} text="No announcements yet." />
          : <div className="space-y-2">
              {announcements.map(a => (
                <div key={a.id} className="rounded-lg p-4" style={{
                  background: a.pinned ? `${C.gold}11` : `${C.navyDeep}aa`,
                  border: `1px solid ${a.pinned ? C.gold + '66' : C.navyLight + '44'}`,
                  borderLeft: `3px solid ${a.pinned ? C.goldLight : C.brandNavy}`,
                }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {a.pinned && <Star size={12} style={{ color: C.goldLight }} />}
                        <span className="font-display text-xl tracking-wider" style={{ color: C.cream }}>{a.title}</span>
                      </div>
                      <p className="font-body text-sm whitespace-pre-wrap" style={{ color: `${C.cream}dd` }}>{a.body}</p>
                      <div className="font-mono text-[10px] tracking-wider mt-2" style={{ color: `${C.cream}55` }}>
                        BY {(a.author || 'admin').toUpperCase()} • {new Date(a.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {isAdminUser && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => handleEdit(a)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.navyLight}66`, color: C.cream }}>EDIT</button>
                        <button onClick={() => handleDelete(a.id)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.red}33`, color: C.redLight }}>DEL</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* RESULTS */}
      {subtab === 'results' && (
        results.length === 0
          ? <EmptyState icon={<Trophy size={40} />} text="No results posted yet." />
          : <div className="space-y-2">
              {results.map(r => {
                const home = teamById(r.homeTeamId);
                const away = teamById(r.awayTeamId);
                const homeWon = r.homeScore > r.awayScore;
                const awayWon = r.awayScore > r.homeScore;
                return (
                  <div key={r.id} className="rounded-lg p-4" style={{
                    background: `${C.navyDeep}aa`,
                    border: `1px solid ${C.navyLight}44`,
                    borderLeft: `3px solid ${C.goldLight}`,
                  }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="font-mono text-[10px] tracking-[0.25em] mb-2 flex items-center gap-2" style={{ color: `${C.cream}66` }}>
                          {new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          {r.autoFromSubmission && (
                            <span className="px-1.5 py-0.5 rounded" style={{
                              background: `${C.greenLight}22`, color: C.greenLight, letterSpacing: '0.15em',
                            }}>FROM STATS</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <TeamPill team={home} fallback={r.homeTeamId} dimmed={!homeWon && !(r.homeScore === r.awayScore)} />
                            <span className="font-display text-3xl" style={{ color: homeWon ? C.goldLight : C.cream }}>{r.homeScore}</span>
                          </div>
                          <span className="font-mono text-xs" style={{ color: `${C.cream}66` }}>—</span>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-3xl" style={{ color: awayWon ? C.goldLight : C.cream }}>{r.awayScore}</span>
                            <TeamPill team={away} fallback={r.awayTeamId} dimmed={!awayWon && !(r.homeScore === r.awayScore)} />
                          </div>
                        </div>
                        {r.notes && <p className="font-body text-sm mt-2" style={{ color: `${C.cream}cc` }}>{r.notes}</p>}
                      </div>
                      {isAdminUser && (
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(r)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.navyLight}66`, color: C.cream }}>EDIT</button>
                          <button onClick={() => handleDelete(r.id)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.red}33`, color: C.redLight }}>DEL</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
      )}

      {showCompose && (
        <NewsComposeModal
          existing={editing}
          defaultType={subtab === 'announcements' ? 'announcement' : subtab === 'results' ? 'result' : 'matchup'}
          allTeams={allTeams}
          author={account.username}
          onClose={() => { setShowCompose(false); setEditing(null); }}
          onSave={() => { setShowCompose(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
};

const TeamPill = ({ team, fallback, dimmed = false }) => {
  if (!team) return (
    <div className="font-mono text-[10px] tracking-wider px-2 py-1 rounded" style={{
      background: `${C.navyLight}33`, color: `${C.cream}66`, opacity: dimmed ? 0.5 : 1,
    }}>{fallback || '?'}</div>
  );
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{
      background: (team.color || C.brandNavy) + 'dd',
      border: `1px solid ${team.color || C.brandNavy}`,
      opacity: dimmed ? 0.55 : 1,
    }}>
      <span className="font-heading tracking-wider text-xs" style={{ color: '#fff', letterSpacing: 1.5 }}>{team.tag}</span>
      <span className="font-display text-sm tracking-wider hidden sm:inline" style={{ color: '#fff' }}>{team.name.toUpperCase()}</span>
    </div>
  );
};

const NewsComposeModal = ({ existing, defaultType, allTeams, author, onClose, onSave }) => {
  const isEdit = !!existing;
  const [type, setType] = useState(existing?.type || defaultType);
  const [title, setTitle] = useState(existing?.title || '');
  const [body, setBody] = useState(existing?.body || '');
  const [pinned, setPinned] = useState(existing?.pinned || false);
  const [homeTeamId, setHomeTeamId] = useState(existing?.homeTeamId || '');
  const [awayTeamId, setAwayTeamId] = useState(existing?.awayTeamId || '');
  const [homeScore, setHomeScore] = useState(existing?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(existing?.awayScore ?? 0);
  const [date, setDate] = useState(() => {
    const d = existing?.date ? new Date(existing.date) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [notes, setNotes] = useState(existing?.notes || '');
  const [error, setError] = useState('');

  const approvedTeams = allTeams.filter(t => t.status === 'approved');

  const save = async () => {
    setError('');
    const id = existing?.id || `n_${Math.random().toString(36).slice(2, 10)}`;
    const base = {
      id, type, author,
      createdAt: existing?.createdAt || Date.now(),
    };
    let item;
    if (type === 'announcement') {
      if (!title.trim()) { setError('Title is required'); return; }
      if (!body.trim()) { setError('Body is required'); return; }
      item = { ...base, title: title.trim(), body: body.trim(), pinned };
    } else if (type === 'matchup') {
      if (!homeTeamId || !awayTeamId) { setError('Pick both teams'); return; }
      if (homeTeamId === awayTeamId) { setError('Teams must be different'); return; }
      item = { ...base, homeTeamId, awayTeamId, date: new Date(date).getTime(), notes: notes.trim() };
    } else {
      if (!homeTeamId || !awayTeamId) { setError('Pick both teams'); return; }
      if (homeTeamId === awayTeamId) { setError('Teams must be different'); return; }
      item = { ...base, homeTeamId, awayTeamId, date: new Date(date).getTime(),
               homeScore: parseInt(homeScore, 10) || 0, awayScore: parseInt(awayScore, 10) || 0,
               notes: notes.trim() };
    }
    await db.saveNews(item);
    onSave();
  };

  const Lbl = ({ children }) => <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{children}</label>;
  const inputStyle = { background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream };

  return (
    <ModalShell onClose={onClose} title={isEdit ? 'EDIT NEWS' : 'NEW NEWS POST'} maxWidth="max-w-lg">
      {/* Type picker (only when creating new) */}
      {!isEdit && (
        <div className="flex gap-1 mb-4 p-1 rounded" style={{ background: `${C.navyDeep}88` }}>
          {[
            { id: 'matchup', label: 'MATCHUP' },
            { id: 'announcement', label: 'ANNOUNCEMENT' },
            { id: 'result', label: 'RESULT' },
          ].map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className="flex-1 py-1.5 font-heading tracking-wider text-[10px] rounded"
              style={{
                background: type === t.id ? `${C.goldLight}22` : 'transparent',
                color: type === t.id ? C.goldLight : `${C.cream}88`,
                border: `1px solid ${type === t.id ? C.goldLight : 'transparent'}66`,
              }}>{t.label}</button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {type === 'announcement' && (
          <>
            <div>
              <Lbl>TITLE</Lbl>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded px-3 py-2" style={inputStyle} placeholder="Season 2 has begun!" />
            </div>
            <div>
              <Lbl>BODY</Lbl>
              <textarea value={body} onChange={(e) => setBody(e.target.value)}
                rows={5} className="w-full rounded px-3 py-2 resize-none" style={inputStyle}
                placeholder="Write your announcement here..." />
            </div>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer" style={{ color: C.cream }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <span>📌 PIN TO TOP</span>
            </label>
          </>
        )}

        {(type === 'matchup' || type === 'result') && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Lbl>HOME TEAM</Lbl>
                <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}
                  className="w-full rounded px-3 py-2" style={inputStyle}>
                  <option value="" style={{ background: C.navyDeep }}>— select —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <Lbl>AWAY TEAM</Lbl>
                <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}
                  className="w-full rounded px-3 py-2" style={inputStyle}>
                  <option value="" style={{ background: C.navyDeep }}>— select —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Lbl>{type === 'matchup' ? 'KICKOFF DATE & TIME' : 'MATCH DATE'}</Lbl>
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded px-3 py-2" style={inputStyle} />
            </div>
            {type === 'result' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Lbl>HOME SCORE</Lbl>
                  <input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)}
                    className="w-full rounded px-3 py-2" style={inputStyle} />
                </div>
                <div>
                  <Lbl>AWAY SCORE</Lbl>
                  <input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)}
                    className="w-full rounded px-3 py-2" style={inputStyle} />
                </div>
              </div>
            )}
            <div>
              <Lbl>NOTES (OPTIONAL)</Lbl>
              <input value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded px-3 py-2" style={inputStyle} placeholder="Featured match, late equalizer, etc." />
            </div>
          </>
        )}

        {error && <div className="font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

        <button
          onClick={save}
          className="w-full py-2.5 font-heading tracking-wider text-sm rounded mt-2"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor, boxShadow: `0 2px 8px ${C.green}66`,
          }}
        >{isEdit ? 'SAVE CHANGES' : 'POST'}</button>
      </div>
    </ModalShell>
  );
};

// ============ HALL OF FAME ============
const HallOfFameView = ({ allPlayers, allTeams, onPlayerClick }) => {
  // Load season champions (separate from individual awards)
  const [champions, setChampions] = useState({});
  useEffect(() => { db.getChampions().then(c => setChampions(c || {})); }, []);
  const teamById = (id) => (allTeams || []).find(t => t.id === id);

  // Build a map: { season -> { awardId -> { player, award } } }
  const bySeason = {};
  allPlayers.forEach(p => {
    (p.awards || []).forEach(aw => {
      if (!bySeason[aw.season]) bySeason[aw.season] = {};
      bySeason[aw.season][aw.awardId] = { player: p, award: aw };
    });
  });
  const seasons = Object.keys(bySeason).sort().reverse();
  const championSeasons = Object.keys(champions).sort().reverse();

  // Per-player count for "most decorated" leaderboard
  const decoratedPlayers = allPlayers
    .filter(p => (p.awards || []).length > 0)
    .map(p => ({ player: p, count: p.awards.length }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Crown size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>HALL OF FAME</h3>
      </div>

      {/* SEASON CHAMPIONS — winner + runner-up per season */}
      {championSeasons.length > 0 && (
        <div className="mb-8">
          <h4 className="font-display text-xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
            <Trophy size={16} style={{ color: C.goldLight }} /> SEASON CHAMPIONS
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {championSeasons.map(s => {
              const info = champions[s];
              const w = info.winnerTeamId ? teamById(info.winnerTeamId) : null;
              const r = info.runnerUpTeamId ? teamById(info.runnerUpTeamId) : null;
              return (
                <div key={s} className="rounded-xl p-4" style={{
                  background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
                  border: `1px solid ${C.gold}55`,
                  boxShadow: `0 2px 10px ${C.gold}22`,
                }}>
                  <div className="font-display text-2xl tracking-wider mb-3" style={{ color: C.brandNavy }}>{s}</div>
                  <div className="flex items-start gap-3 mb-2">
                    <ChampionTrophy size={32} tone="gold" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.brandNavy}88` }}>CHAMPION</div>
                      <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.brandNavy }}>
                        {w ? w.name : <span style={{ fontStyle: 'italic', color: `${C.brandNavy}66` }}>—</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ChampionTrophy size={28} tone="silver" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.brandNavy}88` }}>RUNNER-UP</div>
                      <div className="font-heading tracking-wider text-sm truncate" style={{ color: `${C.brandNavy}cc` }}>
                        {r ? r.name : <span style={{ fontStyle: 'italic', color: `${C.brandNavy}66` }}>—</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {seasons.length === 0 && championSeasons.length === 0 ? (
        <EmptyState icon={<Trophy size={40} />} text="No award winners yet. Champions will be honored here." />
      ) : (
        <>
          {/* MOST DECORATED */}
          {decoratedPlayers.length > 0 && (
            <div className="mb-6">
              <h4 className="font-display text-xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
                <Sparkles size={14} style={{ color: C.goldLight }} /> MOST DECORATED
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {decoratedPlayers.slice(0, 8).map(({ player, count }) => (
                  <button
                    key={player.username}
                    onClick={() => onPlayerClick(player)}
                    className="rounded-lg p-3 text-center transition-all hover:scale-[1.03]"
                    style={{
                      background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
                      border: `1px solid ${C.gold}66`,
                      boxShadow: `0 2px 8px ${C.gold}33`,
                    }}
                  >
                    <div className="flex justify-center gap-1 mb-2">
                      {(player.awards || []).slice(0, 4).map((aw, i) => (
                        <AwardIcon key={i} awardId={aw.awardId} size={20} />
                      ))}
                    </div>
                    <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>
                      {player.username.toUpperCase()}
                    </div>
                    <div className="font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
                      {count} {count === 1 ? 'AWARD' : 'AWARDS'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SEASONS */}
          <h4 className="font-display text-xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
            <Calendar size={14} style={{ color: C.goldLight }} /> WINNERS BY SEASON
          </h4>
          <div className="space-y-4">
            {seasons.map(s => (
              <div key={s} className="rounded-xl p-4" style={{
                background: C.white,
                border: `1px solid ${C.gold}55`,
                boxShadow: `0 2px 12px ${C.gold}22`,
              }}>
                <div className="font-display text-2xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
                  <span style={{ color: C.goldLight }}>SEASON</span> {s}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {AWARD_TYPES.map(at => {
                    const winner = bySeason[s][at.id];
                    return (
                      <div key={at.id} className="rounded-lg p-3" style={{
                        background: winner ? `${C.gold}11` : `${C.navyLight}33`,
                        border: `1px solid ${winner ? C.gold + '55' : C.navyLight}`,
                        opacity: winner ? 1 : 0.55,
                      }}>
                        <div className="flex items-center gap-2 mb-2">
                          <AwardIcon awardId={at.id} size={28} />
                          <div>
                            <div className="font-heading text-[11px] tracking-wider" style={{ color: C.cream }}>{at.name.toUpperCase()}</div>
                            <div className="font-mono text-[9px]" style={{ color: `${C.cream}66` }}>{at.desc.toUpperCase()}</div>
                          </div>
                        </div>
                        {winner ? (
                          <button
                            onClick={() => onPlayerClick(winner.player)}
                            className="w-full text-left mt-1 px-2 py-1.5 rounded transition-all hover:scale-[1.02]"
                            style={{ background: C.white, border: `1px solid ${C.gold}33` }}
                          >
                            <div className="font-display text-lg tracking-wider" style={{ color: C.cream }}>
                              {winner.player.username.toUpperCase()}
                            </div>
                            <div className="font-mono text-[10px]" style={{ color: `${C.cream}66` }}>
                              {winner.player.position}
                            </div>
                          </button>
                        ) : (
                          <div className="text-center font-mono text-[10px] py-2" style={{ color: `${C.cream}55` }}>
                            — VACANT —
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ============ DASHBOARD ============
// ============ VOTING TAB (player-facing) ============
// Shown only when there's an open voting period. Players pick 1 player per
// position (GK, DEF, CM, ST) from the eligible pool, then submit. Once
// submitted, the tab shows what they voted for and lets them change votes
// until the period closes.
const VotingTab = ({ account, period, allPlayers, rankings, onRefresh }) => {
  const [myVotes, setMyVotes] = useState({ gk: '', def: '', cm: '', st: '' });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Build candidate list per position from the eligible_players list.
  // Each candidate gets their season stats attached for the voter to inspect.
  // Excludes the voter themselves (can't vote for yourself).
  const candidates = useMemo(() => {
    const result = { GK: [], DEF: [], CM: [], ST: [] };
    for (const username of (period.eligiblePlayers || [])) {
      if (username.toLowerCase() === account.username.toLowerCase()) continue;
      const p = allPlayers.find(x => x.username.toLowerCase() === username.toLowerCase());
      if (!p) continue;
      if (!result[p.position]) continue;
      result[p.position].push(p);
    }
    // Sort each list by overall rating (highest first) so star players show on top
    const sortFn = (a, b) => {
      const ra = rankings?.[a.username]?.overall || 0;
      const rb = rankings?.[b.username]?.overall || 0;
      return rb - ra;
    };
    Object.keys(result).forEach(pos => result[pos].sort(sortFn));
    return result;
  }, [period, allPlayers, account.username, rankings]);

  // Check if the voter has already submitted votes for this period
  useEffect(() => {
    (async () => {
      try {
        const allVotes = await db.listTotwVotes(period.id);
        const mine = allVotes.filter(v => v.voterUsername.toLowerCase() === account.username.toLowerCase());
        if (mine.length > 0) {
          const prev = { gk: '', def: '', cm: '', st: '' };
          for (const v of mine) {
            if (v.position === 'GK')  prev.gk  = v.votedForUsername;
            if (v.position === 'DEF') prev.def = v.votedForUsername;
            if (v.position === 'CM')  prev.cm  = v.votedForUsername;
            if (v.position === 'ST')  prev.st  = v.votedForUsername;
          }
          setMyVotes(prev);
          setSubmitted(mine.length === 4);
        }
      } catch (e) {
        console.error('Could not load prior votes:', e);
      }
    })();
  }, [period.id, account.username]);

  const pickFor = (pos, username) => {
    setError(''); setInfo('');
    setSubmitted(false);
    setMyVotes(prev => ({ ...prev, [pos]: username }));
  };

  const handleSubmit = async () => {
    setError(''); setInfo('');
    if (!myVotes.gk || !myVotes.def || !myVotes.cm || !myVotes.st) {
      setError('Pick one player for every position before submitting.');
      return;
    }
    setBusy(true);
    try {
      const res = await db.submitTotwVotes(period.id, account.username, myVotes);
      if (!res.ok) { setError(res.reason || 'Could not submit votes.'); setBusy(false); return; }
      setSubmitted(true);
      setInfo('✓ Your votes are in. You can change them until voting closes.');
      onRefresh && onRefresh();
      setTimeout(() => setInfo(''), 4000);
    } catch (e) {
      setError('Could not submit: ' + (e?.message || e));
    }
    setBusy(false);
  };

  const closesIn = useMemo(() => {
    const ms = period.closesAt - Date.now();
    if (ms <= 0) return 'CLOSED';
    const hours = Math.floor(ms / 3_600_000);
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }, [period.closesAt]);

  const POSITIONS = [
    { key: 'gk',  label: 'GOALKEEPER',  pos: 'GK',  needed: 1 },
    { key: 'def', label: 'DEFENDER',    pos: 'DEF', needed: 3 },
    { key: 'cm',  label: 'MIDFIELDER',  pos: 'CM',  needed: 2 },
    { key: 'st',  label: 'STRIKER',     pos: 'ST',  needed: 2 },
  ];

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* HEADER */}
      <div className="rounded-xl p-4 fade-in" style={{
        background: `linear-gradient(135deg, #2196f322 0%, ${C.white} 100%)`,
        border: `1px solid #2196f355`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={16} style={{ color: '#2196f3' }} />
          <span className="font-display text-2xl tracking-wider" style={{ color: C.brandNavy }}>VOTE TOTW</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Pick the best player at each position. The TOTW XI will have 1 goalkeeper, 3 defenders, 2 midfielders, and 2 strikers — but you only vote for one per position. Admin picks the final winners after voting closes.
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] tracking-[0.2em] px-2 py-1 rounded" style={{ background: `#2196f322`, color: '#2196f3' }}>
            CLOSES IN {closesIn}
          </span>
          {submitted && (
            <span className="font-mono text-[10px] tracking-[0.2em] px-2 py-1 rounded" style={{ background: `${C.green}22`, color: C.green }}>
              ✓ YOUR VOTES SUBMITTED
            </span>
          )}
        </div>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}
      {error && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>
      )}

      {/* POSITION COLUMNS */}
      {POSITIONS.map(({ key, label, pos, needed }) => {
        const list = candidates[pos] || [];
        const picked = myVotes[key];
        return (
          <div key={key} className="rounded-lg p-3" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="font-display text-base tracking-wider" style={{ color: C.brandNavy }}>{label}</div>
              <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.brandNavy}66` }}>
                TOTW NEEDS {needed} · YOU PICK 1
              </div>
            </div>
            {list.length === 0 ? (
              <div className="font-mono text-xs py-3 text-center" style={{ color: `${C.brandNavy}66` }}>
                NO ELIGIBLE {label}S
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {list.map(p => {
                  const isPicked = picked === p.username;
                  const ov = rankings?.[p.username]?.overall || 0;
                  const s = p.stats || {};
                  return (
                    <button
                      key={p.username}
                      type="button"
                      onClick={() => pickFor(key, p.username)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors"
                      style={{
                        background: isPicked ? `#2196f322` : C.navyDeep,
                        border: `1px solid ${isPicked ? '#2196f3' : `${C.navyLight}44`}`,
                      }}
                    >
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{
                        border: `1.5px solid ${isPicked ? '#2196f3' : `${C.cream}55`}`,
                        background: isPicked ? '#2196f3' : 'transparent',
                      }}>
                        {isPicked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>{p.username}</div>
                        <div className="font-mono text-[9px]" style={{ color: `${C.cream}88` }}>
                          OVR {ov} · {s.games || 0}G · {s.goals || 0}gls · {s.assists || 0}a
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* SUBMIT */}
      <button
        onClick={handleSubmit}
        disabled={busy || !myVotes.gk || !myVotes.def || !myVotes.cm || !myVotes.st}
        className="w-full py-3 font-display text-lg tracking-wider rounded disabled:opacity-50"
        style={{ background: '#2196f3', color: '#fff' }}
      >{busy ? 'SUBMITTING…' : submitted ? 'UPDATE VOTES' : 'SUBMIT VOTES'}</button>
    </div>
  );
};

const Dashboard = ({ account, onLogout, onUpdate }) => {
  const [view, setView] = useState('home');
  const [showLog, setShowLog] = useState(false);
  const [showEditPos, setShowEditPos] = useState(false);
  const [showEditName, setShowEditName] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [dynamicAdmins, setDynamicAdmins] = useState([]);
  const [weightings, setWeightings] = useState(null);
  const [tickerNews, setTickerNews] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [season, setSeason] = useState('all');
  const [currentSeason, setCurrentSeason] = useState('S1');
  const [currentVotingPeriod, setCurrentVotingPeriod] = useState(null);

  const refresh = async () => {
    setAllPlayers(await db.listAccounts());
    setAllTeams(await db.listTeams());
    setCurrentSeason(await db.getSeason());
    setDynamicAdmins(await db.getAdminList());
    setWeightings(await db.getWeightings());
    // Load news for the header ticker — take the most recent 8 announcements
    const news = await db.listNews();
    setTickerNews((news || []).slice(0, 8));
    // Load the current open voting period (if any) so the VOTE tab shows
    const periods = await db.listTotwPeriods();
    const open = periods.find(p => p.status === 'open' && Date.now() < p.closesAt);
    setCurrentVotingPeriod(open || null);
  };
  useEffect(() => { refresh(); }, [account]);

  // Compute position-relative rankings whenever the player pool or weightings change
  const rankings = useMemo(() => calcRankings(allPlayers, weightings), [allPlayers, weightings]);

  const myTeam = allTeams.find(t => t.id === account.teamId && t.status === 'approved');
  const seasonStats = getStatsForSeason(account, season);
  const games = seasonStats.games || 0;
  const wr = games > 0 ? Math.round((seasonStats.wins / games) * 100) : 0;
  const gpg = games > 0 ? (seasonStats.goals / games).toFixed(2) : '0.00';
  const apg = games > 0 ? (seasonStats.assists / games).toFixed(2) : '0.00';

  const allSeasons = useMemo(() => {
    const set = new Set([currentSeason]);
    allPlayers.forEach(p => (p.matches || []).forEach(m => set.add(m.season || 'S1')));
    return Array.from(set).sort().reverse();
  }, [allPlayers, currentSeason]);

  const accountForCard = useMemo(() => ({ ...account, stats: seasonStats }), [account, seasonStats]);

  const leaderboard = useMemo(() =>
    [...allPlayers]
      .map(p => {
        const s = getStatsForSeason(p, season);
        const attrs = calcAttributes(s, p.position);
        const games = s.games || 0;
        const unranked = games < MIN_GAMES_FOR_RANKING;
        return {
          ...p,
          _seasonStats: s,
          _attrs: attrs,
          _overall: calcOverall(attrs, p.position),
          _unranked: unranked,
          _team: allTeams.find(t => t.id === p.teamId && t.status === 'approved'),
        };
      })
      // Ranked players first (sorted by overall), then unranked players at the bottom.
      .sort((a, b) => {
        if (a._unranked !== b._unranked) return a._unranked ? 1 : -1;
        return b._overall - a._overall;
      }),
    [allPlayers, allTeams, season]);

  const tabs = [
    { id: 'home', label: 'HOME', icon: HomeIcon },
    { id: 'me', label: 'MY CARD', icon: User },
    { id: 'news', label: 'NEWS', icon: Flag },
    { id: 'matches', label: 'MATCHES', icon: Activity },
    { id: 'teams', label: 'TEAMS', icon: Users },
    { id: 'leaderboard', label: 'LEADERBOARD', icon: Trophy },
    { id: 'hof', label: 'HALL OF FAME', icon: Crown },
    { id: 'tiers', label: 'TIER PREVIEW', icon: Sparkles },
  ];
  // VOTE tab appears only while a voting period is open
  if (currentVotingPeriod) {
    tabs.splice(4, 0, { id: 'vote', label: 'VOTE TOTW', icon: Trophy });
  }
  if (isAdmin(account, dynamicAdmins)) tabs.push({ id: 'admin', label: 'ADMIN', icon: Crown });

  return (
    <div className="min-h-screen pitch-bg" style={{ color: C.cream }}>
      <div className="absolute inset-0 pitch-lines opacity-20 pointer-events-none" />

      {/* HEADER — 2006 sports-broadcast style: glossy blue bar + gold ticker + navy nav */}
      <div className="sticky top-0 z-30">
        {/* Glossy blue bar with logo + user chip */}
        <div className="asl-header">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3 relative" style={{ zIndex: 1 }}>
            <div className="asl-logo-plate shrink-0">
              <img src={ASL_LOGO_DIAMOND} alt="ASL" style={{ display: 'block', height: 40 }} />
            </div>
            <div className="min-w-0">
              <div className="asl-wordmark" style={{ fontSize: 28 }}>ASL</div>
              <div className="asl-sublabel hidden sm:block" style={{ fontSize: 14, marginTop: 4, letterSpacing: 7 }}>
                ALLIANCE STRIKERS LEAGUE
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="px-2 py-1 rounded focus:outline-none"
                style={{
                  fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 1.5,
                  background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,0,0,0.35)',
                  color: '#fff', textTransform: 'uppercase',
                }}
              >
                <option value="all" style={{ background: '#0e2451' }}>ALL TIME</option>
                {allSeasons.map(s => <option key={s} value={s} style={{ background: '#0e2451' }}>{s}</option>)}
              </select>
              <div className="asl-user-chip hidden sm:flex items-center gap-1.5" style={{ padding: '5px 12px', fontSize: 11 }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#8ce880', boxShadow: '0 0 6px #8ce880' }} />
                @{account.username}
                {isAdmin(account, dynamicAdmins) && <Crown size={11} style={{ color: '#d8b858' }} />}
              </div>
              <button
                onClick={onLogout}
                className="px-2 py-1 rounded flex items-center gap-1"
                style={{
                  fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 1.5,
                  color: '#fff', background: 'rgba(168,36,58,0.7)',
                  border: '1px solid rgba(0,0,0,0.4)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                  textTransform: 'uppercase',
                }}
              ><LogOut size={11} /> EXIT</button>
            </div>
          </div>
        </div>

        {/* Gold scrolling news ticker (hides when there's no news) */}
        {tickerNews.length > 0 && (
          <div className="asl-ticker">
            <div className="asl-ticker-track">
              {[...tickerNews, ...tickerNews].map((n, i) => (
                <span key={i}>{n.title || n.body || 'NEWS'}</span>
              ))}
            </div>
          </div>
        )}

        {/* Navy nav bar with gold underline on active tab */}
        <div className="asl-nav-bar">
          <div className="max-w-6xl mx-auto px-3 flex gap-0 overflow-x-auto">
            {tabs.map(t => {
              const active = view === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setView(t.id)}
                  className={`asl-nav-tab ${active ? 'active' : ''} flex items-center gap-1.5 whitespace-nowrap`}
                  style={{ padding: '11px 14px 9px', fontSize: 11 }}
                >
                  <t.icon size={12} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-6 fade-in">
        {/* MY CARD VIEW */}
        {view === 'home' && (
          <HomeView
            account={account}
            allPlayers={allPlayers}
            allTeams={allTeams}
            rankings={rankings}
            currentSeason={currentSeason}
            onJump={setView}
            onUpdate={onUpdate}
          />
        )}

        {view === 'me' && (
          <div className="space-y-6">
            {/* SEASON FILTER BANNER */}
            <div className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" style={{
              background: `linear-gradient(135deg, ${C.brandNavy} 0%, ${C.navyLight}dd 100%)`,
              border: `1px solid ${C.navyLight}`,
              boxShadow: `0 2px 12px ${C.brandNavy}22`,
            }}>
              <div className="flex items-center gap-2">
                <Calendar size={16} style={{ color: C.goldLight }} />
                <span className="font-mono text-[10px] tracking-[0.25em]" style={{ color: `${C.onColor}99` }}>VIEWING STATS FOR</span>
                <span className="font-display text-xl tracking-wider" style={{ color: C.goldLight }}>
                  {season === 'all' ? 'ALL TIME' : `SEASON ${season}`}
                </span>
              </div>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setSeason('all')}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded transition-all"
                  style={{
                    background: season === 'all' ? C.goldLight : `${C.brandNavyDeep}88`,
                    color: season === 'all' ? C.brandNavy : `${C.onColor}cc`,
                    border: `1px solid ${season === 'all' ? C.goldLight : C.onColor}33`,
                  }}
                >ALL TIME</button>
                {allSeasons.map(s => (
                  <button
                    key={s}
                    onClick={() => setSeason(s)}
                    className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded transition-all"
                    style={{
                      background: season === s ? C.goldLight : `${C.brandNavyDeep}88`,
                      color: season === s ? C.brandNavy : `${C.onColor}cc`,
                      border: `1px solid ${season === s ? C.goldLight : C.onColor}33`,
                    }}
                  >{s}{s === currentSeason ? ' ●' : ''}</button>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
              <div className="flex flex-col items-center gap-3">
                <PlayerCard account={accountForCard} size="lg" team={myTeam} rankings={rankings} />
                <div className="flex gap-2 flex-wrap justify-center">
                  <button
                    onClick={() => setShowShare(true)}
                    className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all hover:scale-105"
                    style={{
                      background: C.brandNavy, color: C.onColor,
                      boxShadow: `0 2px 8px ${C.brandNavy}66`,
                    }}
                  ><Share2 size={12} /> SHARE CARD</button>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all"
                    style={{
                      background: `${C.navyLight}66`, color: C.cream, border: `1px solid ${C.navyLight}`,
                    }}
                  ><User size={12} /> IMAGE</button>
                  <button
                    onClick={() => setShowEditPos(true)}
                    className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all"
                    style={{
                      background: `${C.navyLight}66`, color: C.cream, border: `1px solid ${C.navyLight}`,
                    }}
                  ><Edit3 size={12} /> POSITION</button>
                  <button
                    onClick={() => setShowEditName(true)}
                    className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all"
                    style={{
                      background: `${C.navyLight}66`, color: C.cream, border: `1px solid ${C.navyLight}`,
                    }}
                  ><Edit3 size={12} /> NAME</button>
                </div>
                {myTeam && (
                  <div className="text-center mt-1">
                    <div className="font-mono text-[9px] tracking-[0.3em]" style={{ color: `${C.cream}66` }}>PLAYS FOR</div>
                    <div className="font-display text-lg tracking-wider" style={{ color: myTeam.color || C.greenLight }}>{myTeam.name.toUpperCase()}</div>
                  </div>
                )}
                {(account.awards || []).length > 0 && (
                  <div className="rounded-lg px-3 py-2.5 w-full max-w-[300px]" style={{
                    background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
                    border: `1px solid ${C.gold}66`,
                    boxShadow: `0 2px 8px ${C.gold}33`,
                  }}>
                    <div className="font-mono text-[9px] tracking-[0.3em] text-center mb-2" style={{ color: `${C.gold}cc` }}>
                      TROPHY CABINET
                    </div>
                    <div className="space-y-1">
                      {(account.awards || []).map((aw, i) => {
                        const a = AWARD_BY_ID[aw.awardId];
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <AwardIcon awardId={aw.awardId} size={20} />
                            <span className="font-heading text-[11px] tracking-wider flex-1" style={{ color: C.cream }}>
                              {a.name.toUpperCase()}
                            </span>
                            <span className="font-mono text-[10px]" style={{ color: C.goldLight }}>{aw.season}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-display text-2xl tracking-wider mb-3 flex items-center gap-2">
                    <Sparkles size={16} style={{ color: C.goldLight }} />
                    CAREER OVERVIEW
                    {season !== 'all' && (
                      <span className="font-mono text-[9px] px-2 py-0.5 rounded tracking-wider" style={{
                        background: `${C.gold}22`, color: C.goldLight, border: `1px solid ${C.gold}44`,
                      }}>{season}</span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Metric icon={<Activity />} label="GAMES" value={games} accent={C.greenLight} />
                    <Metric icon={<TrendingUp />} label="WIN RATE" value={`${wr}%`} accent={C.greenLight} />
                    <Metric icon={<Target />} label="GOALS" value={seasonStats.goals || 0} accent={C.redLight} />
                    <Metric icon={<Zap />} label="ASSISTS" value={seasonStats.assists || 0} accent={C.goldLight} />
                    <Metric icon={<Target />} label="G / GAME" value={gpg} accent={C.redLight} />
                    <Metric icon={<Zap />} label="A / GAME" value={apg} accent={C.goldLight} />
                    <Metric icon={<Shield />} label="CLEAN SHEETS" value={seasonStats.cleanSheets || 0} accent={C.greenLight} />
                    <Metric icon={<Trophy />} label="AWARDS" value={(account.awards || []).length} accent={C.goldLight} />
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-2xl tracking-wider mb-3 flex items-center gap-2">
                    <Trophy size={16} style={{ color: C.goldLight }} /> RECORD
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <RecordBox value={seasonStats.wins || 0} label="WINS" color={C.greenLight} />
                    <RecordBox value={seasonStats.draws || 0} label="DRAWS" color={C.goldLight} />
                    <RecordBox value={seasonStats.losses || 0} label="LOSSES" color={C.redLight} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MATCHES */}
        {view === 'matches' && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={22} style={{ color: C.greenLight }} />
              <h3 className="font-display text-3xl tracking-wider">MATCH LOG</h3>
            </div>
            {(!account.matches || account.matches.length === 0) ? (
              <EmptyState icon={<Activity size={40} />} text="No matches yet. Stats will appear here once an admin submits and approves your match data." />
            ) : (
              <div className="space-y-2">
                {(season === 'all' ? account.matches : account.matches.filter(m => (m.season || 'S1') === season)).map((m, i) => (
                  <div key={m.id || i} className="rounded-lg p-3 flex items-center gap-3 transition-all hover:translate-x-1" style={{
                    background: `${C.navyDeep}aa`,
                    border: `1px solid ${C.navyLight}44`,
                    borderLeft: `3px solid ${m.result === 'W' ? C.green : m.result === 'L' ? C.red : C.gold}`,
                  }}>
                    <ResultBadge result={m.result} />
                    <div className="flex-1 min-w-0">
                      <div className="font-heading tracking-wider truncate" style={{ color: C.cream }}>
                        VS {(m.opponent || 'UNKNOWN').toUpperCase()}
                      </div>
                      <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.cream}66` }}>
                        {new Date(m.date).toLocaleDateString()} • {m.season || 'S1'}
                      </div>
                    </div>
                    <div className="flex gap-3 font-mono text-xs items-center">
                      <span><span style={{ color: C.greenLight }}>{m.goals}</span>G</span>
                      <span><span style={{ color: C.goldLight }}>{m.assists}</span>A</span>
                      {m.cleanSheet && <Shield size={14} style={{ color: C.greenLight }} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TEAMS */}
        {view === 'teams' && <TeamsView account={account} onUpdate={onUpdate} rankings={rankings} />}

        {/* LEADERBOARD */}
        {view === 'leaderboard' && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={22} style={{ color: C.goldLight }} />
              <h3 className="font-display text-3xl tracking-wider">LEADERBOARD</h3>
              {season !== 'all' && (
                <span className="font-mono text-[10px] px-2 py-0.5 rounded tracking-wider" style={{
                  background: `${C.gold}22`, color: C.goldLight, border: `1px solid ${C.gold}44`,
                }}>{season}</span>
              )}
            </div>
            <div className="space-y-2">
              {leaderboard.map((p, i) => {
                // Unranked players (fewer than 3 games) don't get a numeric rank,
                // a medal color, or a score — they sit at the bottom marked UNRANKED.
                const isUnranked = p._unranked;
                const rankColor = isUnranked ? `${C.cream}40`
                  : i === 0 ? C.goldLight : i === 1 ? '#c4c4c4' : i === 2 ? '#c08555' : `${C.cream}55`;
                const showMedal = !isUnranked && i < 3;
                return (
                  <button
                    key={p.username}
                    onClick={() => setSelectedPlayer({ ...p, stats: p._seasonStats })}
                    className="w-full rounded-lg p-3 flex items-center gap-4 transition-all hover:translate-x-1 hover:scale-[1.005]"
                    style={{
                      background: showMedal ? `linear-gradient(90deg, ${rankColor}11 0%, ${C.navyDeep}aa 30%)` : `${C.navyDeep}aa`,
                      border: `1px solid ${showMedal ? rankColor : C.navyLight}44`,
                      opacity: isUnranked ? 0.7 : 1,
                    }}
                  >
                    <div className="font-display text-3xl w-10 text-center" style={{ color: rankColor }}>
                      {isUnranked ? '–' : i + 1}
                    </div>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-display text-2xl flex-shrink-0" style={{
                      background: `linear-gradient(135deg, ${C.green} 0%, ${C.brandNavy} 100%)`,
                      color: C.onColor,
                      border: `2px solid ${rankColor}66`,
                    }}>
                      {p.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-heading tracking-wider truncate flex items-center gap-1" style={{ color: C.cream }}>
                        {isTeamCaptain(p, p._team) && <CaptainStar size={13} />}
                        {p.username.toUpperCase()}
                      </div>
                      <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.cream}66` }}>
                        {p.position} • {p._seasonStats.games || 0} GAMES
                        {p._team && <span style={{ color: p._team.color || C.greenLight }}> • {p._team.tag}</span>}
                      </div>
                    </div>
                    {isUnranked ? (
                      <div className="font-mono text-[10px] tracking-wider text-right" style={{ color: `${C.cream}66` }}>
                        UNRANKED<br />{p._seasonStats.games || 0}/{MIN_GAMES_FOR_RANKING} GAMES
                      </div>
                    ) : (
                      <div className="font-display text-3xl" style={{ color: C.greenLight, textShadow: `0 0 12px ${C.green}` }}>{p._overall}</div>
                    )}
                    <ChevronRight size={18} style={{ color: `${C.cream}55` }} />
                  </button>
                );
              })}
              {leaderboard.length === 0 && <EmptyState icon={<Trophy size={40} />} text="No players yet" />}
            </div>
          </div>
        )}

        {/* HALL OF FAME */}
        {view === 'hof' && (
          <HallOfFameView allPlayers={allPlayers} allTeams={allTeams} onPlayerClick={setSelectedPlayer} />
        )}

        {view === 'tiers' && <TierPreview />}

        {view === 'news' && <NewsView account={account} allTeams={allTeams} dynamicAdmins={dynamicAdmins} />}

        {/* VOTE TAB — only renders when a voting period is open */}
        {view === 'vote' && currentVotingPeriod && (
          <VotingTab
            account={account}
            period={currentVotingPeriod}
            allPlayers={allPlayers}
            rankings={rankings}
            onRefresh={refresh}
          />
        )}

        {/* ADMIN */}
        {view === 'admin' && isAdmin(account, dynamicAdmins) && <AdminPanel account={account} dynamicAdmins={dynamicAdmins} onRefreshAdmins={refresh} />}
      </div>

      {/* MODALS */}
      {showLog && <LogMatchModal account={account} allPlayers={allPlayers} currentSeason={currentSeason} onClose={() => setShowLog(false)} onSave={onUpdate} />}
      {showEditPos && <EditPositionModal account={account} onClose={() => setShowEditPos(false)} onSave={onUpdate} />}
      {showEditName && <EditNameModal account={account} onClose={() => setShowEditName(false)} onSave={onUpdate} />}
      {showUpload && <UploadImageModal account={account} onClose={() => setShowUpload(false)} onSave={onUpdate} />}
      {showShare && <ShareableCardModal account={accountForCard} team={myTeam} onClose={() => setShowShare(false)} />}
      {selectedPlayer && (
        <ShareableCardModal
          account={selectedPlayer}
          team={selectedPlayer._team}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
};

// ============ ROOT ============
// ============ PASSWORD RECOVERY MODAL ============
// Shown when Supabase fires the PASSWORD_RECOVERY event — i.e. the user
// clicked the reset link in their email. Blocks the rest of the app until
// they set a new password.
const PasswordRecoveryModal = ({ onComplete, onCancel }) => {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (pw1.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (pw1 !== pw2) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      const res = await auth.updatePassword(pw1);
      if (!res.ok) { setError(res.reason || 'Could not update password.'); setBusy(false); return; }
      onComplete && onComplete();
    } catch (e) {
      setError(e?.message || 'Could not update password.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md rounded-xl p-6 space-y-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div>
          <div className="font-display text-2xl tracking-wider" style={{ color: C.brandNavy }}>SET NEW PASSWORD</div>
          <p className="font-body text-sm mt-1" style={{ color: `${C.brandNavy}aa` }}>
            You arrived here from a password-reset email. Choose a new password to finish recovering your account.
          </p>
        </div>

        <div className="space-y-2">
          <label className="font-mono text-[10px] tracking-[0.25em] block" style={{ color: `${C.brandNavy}77` }}>NEW PASSWORD</label>
          <input
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            autoFocus
            placeholder="At least 6 characters"
            className="w-full px-3 py-2 font-body text-sm rounded"
            style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
          />
          <label className="font-mono text-[10px] tracking-[0.25em] block pt-1" style={{ color: `${C.brandNavy}77` }}>CONFIRM PASSWORD</label>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Type it again"
            className="w-full px-3 py-2 font-body text-sm rounded"
            style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          />
        </div>

        {error && (
          <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
            style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
          >CANCEL</button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="flex-1 py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`, color: C.onColor }}
          >{busy ? 'SAVING…' : 'SET NEW PASSWORD'}</button>
        </div>
      </div>
    </div>
  );
};


export default function App() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  // True when the user clicked a password-reset email link and Supabase
  // fired PASSWORD_RECOVERY. Blocks the normal app until they pick a new pw.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;

    // On load, check if there's already a logged-in user.
    (async () => {
      try {
        const acc = await auth.getCurrent();
        if (mounted && acc) setAccount(acc);
      } catch (e) {
        console.error('Session check failed:', e);
      }
      if (mounted) setLoading(false);
    })();

    // Listen for auth state changes (logout, token refresh from another tab, etc.)
    // IMPORTANT: never call other supabase.auth.* methods (like getUser) directly
    // inside this callback — it deadlocks. We read the username from the
    // session object the callback already provides, and load the profile
    // in a separate async task (setTimeout breaks out of the callback lock).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        // Don't load the profile or treat this as a normal sign-in. Show
        // the "set new password" modal until the user finishes recovery.
        setPasswordRecovery(true);
        return;
      }
      if (event === 'SIGNED_OUT') {
        setAccount(null);
        setPasswordRecovery(false);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const user = session?.user;
        if (!user) return;
        // Two sign-in paths:
        // 1. Classic email/password: user_metadata.username is set at signup
        // 2. Discord OAuth: user_metadata comes from Discord (name, full_name,
        //    user_name, preferred_username, avatar_url). No username field.
        //    First-time Discord login = no accounts row yet, we create one.
        const metadata = user.user_metadata || {};
        setTimeout(async () => {
          try {
            // Path 1: try classic username lookup first (fast path for existing users)
            let acc = null;
            if (metadata.username) {
              acc = await db.getAccount(metadata.username);
            }
            // Path 2: look up by auth id (works for both classic + Discord users)
            if (!acc) {
              acc = await db.getAccountById(user.id);
            }
            // Path 3: this must be a first-time Discord sign-in. Create the profile.
            if (!acc && user.app_metadata?.provider === 'discord') {
              const rawName = metadata.full_name || metadata.name
                || metadata.user_name || metadata.preferred_username
                || metadata.custom_claims?.global_name
                || (user.email ? user.email.split('@')[0] : 'Player');
              // Sanitize: strip non-alphanumeric to make a valid username
              let candidate = rawName.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
              if (!candidate) candidate = 'Player' + Math.floor(Math.random() * 10000);
              // Make sure it's unique
              let finalUsername = candidate;
              let suffix = 1;
              while (await db.getAccount(finalUsername)) {
                finalUsername = `${candidate}${suffix}`;
                suffix += 1;
                if (suffix > 99) break;
              }
              // Insert new accounts row
              const { error: insertErr } = await supabase.from('accounts').insert({
                id: user.id,
                username: finalUsername,
                username_lower: finalUsername.toLowerCase(),
                position: 'CM',
                email: user.email || null,
                country: null,
                image_url: metadata.avatar_url || null,
                stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0 },
                matches: [],
                awards: [],
                championships: [],
                created_at: new Date().toISOString(),
              });
              if (insertErr) {
                console.error('Could not create Discord account:', insertErr);
                return;
              }
              acc = await db.getAccountById(user.id);
            }
            if (mounted && acc) setAccount(acc);
          } catch (e) {
            console.error('Profile load failed:', e);
          }
        }, 0);
      }
    });

    return () => { mounted = false; subscription?.unsubscribe(); };
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    setAccount(null);
  };

  if (loading) {
    return (
      <>
        <style>{fontCSS}</style>
        <div className="min-h-screen flex items-center justify-center pitch-bg">
          <div className="flex flex-col items-center gap-4">
            <ASLCrest size={80} />
            <div className="font-mono text-xs tracking-[0.3em]" style={{ color: `${C.cream}77` }}>LOADING LEAGUE...</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{fontCSS}</style>
      {account
        ? <Dashboard account={account} onLogout={handleLogout} onUpdate={setAccount} />
        : <AuthScreen onLogin={setAccount} />
      }
      {passwordRecovery && (
        <PasswordRecoveryModal
          onComplete={async () => {
            // Sign out so the user logs back in fresh with their new password.
            setPasswordRecovery(false);
            await auth.signOut();
            setAccount(null);
          }}
          onCancel={async () => {
            setPasswordRecovery(false);
            await auth.signOut();
            setAccount(null);
          }}
        />
      )}
    </>
  );
}
