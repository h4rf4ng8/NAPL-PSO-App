import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trophy, Target, Zap, Shield, Activity, User, LogOut, Plus, TrendingUp,
  Award, Users, ChevronRight, X, Edit3, Crown, CheckCircle, XCircle,
  Clock, Swords, Calendar, Flag, Star, BarChart3, Hand, Footprints, Sparkles,
  Share2, Download, Copy, Check, Home as HomeIcon
} from 'lucide-react';

// ============ NAPL THEME (LIGHT) ============
// Note: token names are kept for code stability, but values are now light-theme:
// `cream` = primary text (navy), `navy*` = surface/border tints (white/grey).
const C = {
  navy: '#ffffff',          // primary surface (was dark navy)
  navyDeep: '#f4f6fb',      // page background (was darkest)
  navyLight: '#dfe4f0',     // subtle border / muted surface (was mid navy)
  green: '#2d7a4a',         // brand green (unchanged)
  greenLight: '#3fa05f',    // brand green light (unchanged)
  red: '#a8243a',           // brand red (unchanged)
  redLight: '#c93852',      // brand red light (unchanged)
  cream: '#1a2752',         // PRIMARY TEXT — now navy (was cream)
  gold: '#b8941f',          // gold accent (slightly darker for light bg contrast)
  goldLight: '#d4af37',     // gold light
  white: '#ffffff',
  black: '#000000',
  // Real dark navies for cards, accents, and brand moments
  brandNavy: '#1a2752',
  brandNavyDeep: '#0d1530',
  // Text color to use *on top* of colored/dark backgrounds (always white-ish)
  onColor: '#ffffff',
};

// ============ ADMIN CONFIG ============
// ============ ADMIN CONFIG ============
// "Super admins" are hardcoded as a safety net — they can never be removed
// via the UI. They have the unique power to promote/demote other admins.
const SUPER_ADMIN_USERNAMES = ['harfang'];
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
  'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Poland', 'Bosnia and Herzegovina',
  'Brazil', 'Argentina', 'Colombia', 'Chile', 'Australia', 'New Zealand', 'Japan',
  'South Korea', 'China', 'Russia', 'Nigeria', 'South Africa', 'India', 'Other',
];
const COUNTRY_CODES = {
  'Canada': 'ca', 'United States': 'us', 'Mexico': 'mx', 'El Salvador': 'sv',
  'United Kingdom': 'gb', 'Ireland': 'ie', 'France': 'fr',
  'Germany': 'de', 'Spain': 'es', 'Portugal': 'pt', 'Italy': 'it',
  'Netherlands': 'nl', 'Belgium': 'be', 'Switzerland': 'ch',
  'Sweden': 'se', 'Norway': 'no', 'Denmark': 'dk', 'Poland': 'pl',
  'Bosnia and Herzegovina': 'ba',
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
const POSITIONS = ['ST', 'CM', 'DEF', 'GK'];

const emptyStats = () => ({
  games: 0, goals: 0, assists: 0, tackles: 0, interceptions: 0,
  passes: 0, passAccuracy: 0, shots: 0, shotsOnTarget: 0,
  cleanSheets: 0, saves: 0, motm: 0, wins: 0, losses: 0, draws: 0,
});

const getStatsForSeason = (account, season) => {
  if (season === 'all' || !account.matches) return account.stats || emptyStats();
  const matches = (account.matches || []).filter(m => (m.season || 'S1') === season);
  if (matches.length === 0) return emptyStats();
  const s = emptyStats();
  let totalAcc = 0, totalPasses = 0;
  for (const m of matches) {
    s.games += 1;
    s.goals += m.goals || 0;
    s.assists += m.assists || 0;
    s.tackles += m.tackles || 0;
    s.interceptions += m.interceptions || 0;
    s.shots += m.shots || 0;
    s.shotsOnTarget += m.shotsOnTarget || 0;
    s.saves += m.saves || 0;
    if (m.cleanSheet) s.cleanSheets += 1;
    if (m.motm) s.motm += 1;
    if (m.result === 'W') s.wins += 1;
    else if (m.result === 'L') s.losses += 1;
    else s.draws += 1;
    totalPasses += m.passes || 0;
    totalAcc += m.passAccuracy || 0;
  }
  s.passes = Math.round(totalPasses / s.games);
  s.passAccuracy = Math.round(totalAcc / s.games);
  return s;
};

const calcAttributes = (stats, position) => {
  const games = Math.max(stats.games || 0, 1);
  const goals = stats.goals || 0;
  const assists = stats.assists || 0;
  const tackles = stats.tackles || 0;
  const interceptions = stats.interceptions || 0;
  const passes = stats.passes || 0;
  const passAcc = stats.passAccuracy || 0;
  const shots = stats.shots || 0;
  const shotsOnTarget = stats.shotsOnTarget || 0;
  const cleanSheets = stats.cleanSheets || 0;
  const saves = stats.saves || 0;
  const motm = stats.motm || 0;

  const clamp = (n) => Math.min(99, Math.max(40, Math.round(n)));

  const pace = clamp(55 + (assists / games) * 12 + (motm / games) * 10 + (['ST','DEF'].includes(position) ? 8 : 0));
  const shotAcc = shots > 0 ? (shotsOnTarget / shots) : 0.5;
  const shooting = clamp(50 + (goals / games) * 20 + shotAcc * 20 + (position === 'ST' ? 12 : 0));
  const passing = clamp(50 + (assists / games) * 15 + passAcc * 0.35 + Math.min(passes / games, 50) * 0.3 + (position === 'CM' ? 10 : 0));
  const dribbling = clamp(55 + ((goals + assists) / games) * 10 + (motm / games) * 8 + (['ST','CM'].includes(position) ? 8 : 0));
  const defending = clamp(45 + (tackles / games) * 8 + (interceptions / games) * 8 + (cleanSheets / games) * 20 + (position === 'DEF' ? 14 : 0));
  const physical = clamp(60 + ((tackles + interceptions) / games) * 4 + (motm / games) * 8 + (['DEF','ST'].includes(position) ? 6 : 0));

  if (position === 'GK') {
    const gkRating = clamp(55 + (cleanSheets / games) * 25 + (saves / games) * 4 + (motm / games) * 10);
    return {
      pace: clamp(50 + (saves / games) * 2),
      shooting: clamp(40 + (cleanSheets / games) * 10),
      passing: clamp(50 + passAcc * 0.4),
      dribbling: clamp(45 + (saves / games) * 1.5),
      defending: gkRating,
      physical: clamp(60 + (saves / games) * 3),
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
const DEFAULT_POSITION_WEIGHTS = {
  ST:  { goalsPerGame: 0.40, shotPct: 0.25, assistsPerGame: 0.15, passesPerGame: 0.10, tacklesPerGame: 0.05, interceptionsPerGame: 0.05 },
  CM:  { assistsPerGame: 0.30, passesPerGame: 0.25, goalsPerGame: 0.15, tacklesPerGame: 0.15, interceptionsPerGame: 0.10, shotPct: 0.05 },
  DEF: { tacklesPerGame: 0.35, interceptionsPerGame: 0.35, assistsPerGame: 0.15, passesPerGame: 0.10, goalsPerGame: 0.05 },
  GK:  { savesPerGame: 0.35, cleanSheetPct: 0.35, catchesPerGame: 0.30 },
};

// Human-readable labels for each stat key (used in the weightings editor UI)
const STAT_KEY_LABELS = {
  goalsPerGame: 'Goals',
  assistsPerGame: 'Assists',
  tacklesPerGame: 'Tackles',
  interceptionsPerGame: 'Interceptions',
  passesPerGame: 'Passes',
  shotPct: 'Shot %',
  savesPerGame: 'Saves',
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
    interceptionsPerGame:(s.interceptions || 0) / g,
    passesPerGame:       (s.passes || 0) / g,
    shotPct:             (s.shots || 0) > 0 ? (s.goals || 0) / s.shots : 0,
    savesPerGame:        (s.saves || 0) / g,
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

// ============ NAPL CREST (the actual logo) ============
const NAPL_LOGO_SRC = 'data:image/png;base64,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';
const NAPLCrest = ({ size = 40 }) => (
  <img
    src={NAPL_LOGO_SRC}
    alt="NAPL"
    width={size}
    height={size}
    style={{ display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(26, 39, 82, 0.2))' }}
  />
);

const NAPLLogoFull = ({ size = 32 }) => (
  <div className="flex items-center gap-3">
    <NAPLCrest size={size} />
    <div>
      <div className="font-display text-white tracking-wider leading-none" style={{ fontSize: size * 0.85, color: C.cream }}>NAPL</div>
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
    goals: 0, assists: 0, passes: 0, shots: 0, tackles: 0,
    interceptions: 0, saves: 0, catches: 0, cleanSheets: 0, games,
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
        </g>
      ) : (
        <g>
          <text x="160" y="326" fontFamily="Anton, sans-serif" fontSize="22" fill={palette.text} textAnchor="middle" letterSpacing="2.5">{(account.username || '').toUpperCase().slice(0, 14)}</text>
          <line x1="55" y1="338" x2="265" y2="338" stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.6" />
        </g>
      )}

      {/* 7. STATS GRID 3x2 — center-anchored numbers, symmetric around x=160 */}
      <g fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fill={palette.text}>
        <text x="62" y="364" fontSize="20" textAnchor="middle">{displayStats.goals}</text>
        <text x="100" y="364" fontSize="11" letterSpacing="1.5">GOALS</text>
        <text x="62" y="390" fontSize="20" textAnchor="middle">{displayStats.assists}</text>
        <text x="100" y="390" fontSize="11" letterSpacing="1.5">ASSIST</text>
        <text x="62" y="416" fontSize="20" textAnchor="middle">{Number(displayStats.passes || 0).toFixed(1)}</text>
        <text x="100" y="416" fontSize="11" letterSpacing="1.5">PASS</text>

        <text x="220" y="364" fontSize="20" textAnchor="middle">{displayStats.shots}</text>
        <text x="256" y="364" fontSize="11" letterSpacing="1.5">SHO%</text>
        <text x="220" y="390" fontSize="20" textAnchor="middle">{Number(displayStats.tackles || 0).toFixed(1)}</text>
        <text x="256" y="390" fontSize="11" letterSpacing="1.5">TKL</text>
        <text x="220" y="416" fontSize="20" textAnchor="middle">{Number(displayStats.interceptions || 0).toFixed(1)}</text>
        <text x="256" y="416" fontSize="11" letterSpacing="1.5">INT</text>
      </g>
      <line x1="160" y1="348" x2="160" y2="422" stroke={palette.shadow} strokeWidth="0.7" strokeOpacity="0.55" />

      {/* 8. NAPL CREST at bottom center */}
      <image href={NAPL_LOGO_SRC} x="146" y="438" width="28" height="28" preserveAspectRatio="xMidYMid meet" opacity="0.9" />

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
  const joinDate = account.createdAt
    ? new Date(account.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
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
            <NAPLCrest size={110} />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full" style={{
            border: `1px solid ${C.green}66`,
            background: `${C.green}11`,
          }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.greenLight }} />
            <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: C.greenLight }}>OFFICIAL STATS HUB</span>
          </div>
          <h1 className="font-display text-7xl tracking-tight leading-none mb-1" style={{ color: C.cream }}>NAPL</h1>
          <p className="font-heading text-sm tracking-[0.3em]" style={{ color: C.cream, opacity: 0.7 }}>NORTH AMERICA PREMIER LEAGUE</p>
          <p className="font-mono text-[10px] tracking-widest mt-2" style={{ color: C.cream, opacity: 0.4 }}>// PRO SOCCER ONLINE</p>
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
            <NAPLCrest size={28} />
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
    goals: 0, assists: 0, tackles: 0, interceptions: 0,
    passes: 0, passAccuracy: 0, shots: 0, shotsOnTarget: 0,
    cleanSheet: false, saves: 0, motm: false,
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
    let totalPasses = 0, totalAcc = 0;
    for (const m of updatedMatches) {
      lifetime.games += 1;
      lifetime.goals += m.goals || 0;
      lifetime.assists += m.assists || 0;
      lifetime.tackles += m.tackles || 0;
      lifetime.interceptions += m.interceptions || 0;
      lifetime.shots += m.shots || 0;
      lifetime.shotsOnTarget += m.shotsOnTarget || 0;
      lifetime.saves += m.saves || 0;
      if (m.cleanSheet) lifetime.cleanSheets += 1;
      if (m.motm) lifetime.motm += 1;
      if (m.result === 'W') lifetime.wins += 1;
      else if (m.result === 'L') lifetime.losses += 1;
      else lifetime.draws += 1;
      totalPasses += m.passes || 0;
      totalAcc += m.passAccuracy || 0;
    }
    if (lifetime.games > 0) {
      lifetime.passes = Math.round(totalPasses / lifetime.games);
      lifetime.passAccuracy = Math.round(totalAcc / lifetime.games);
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
          <div className="grid grid-cols-4 gap-2">
            <div><Lbl>GOALS</Lbl><input {...num('goals')} /></div>
            <div><Lbl>ASSISTS</Lbl><input {...num('assists')} /></div>
            <div><Lbl>SHOTS</Lbl><input {...num('shots')} /></div>
            <div><Lbl>ON TARGET</Lbl><input {...num('shotsOnTarget')} /></div>
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
          <div className="font-heading text-xs tracking-widest mb-2" style={{ color: C.goldLight }}>POSSESSION</div>
          <div className="grid grid-cols-2 gap-2">
            <div><Lbl>PASSES</Lbl><input {...num('passes')} /></div>
            <div><Lbl>PASS ACC %</Lbl><input {...num('passAccuracy')} /></div>
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
          <div className="font-heading text-xs tracking-widest mb-2" style={{ color: C.redLight }}>DEFENSIVE</div>
          <div className="grid grid-cols-3 gap-2">
            <div><Lbl>TACKLES</Lbl><input {...num('tackles')} /></div>
            <div><Lbl>INTERCEPTS</Lbl><input {...num('interceptions')} /></div>
            <div><Lbl>SAVES</Lbl><input {...num('saves')} /></div>
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

const SubmitTeamModal = ({ account, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [color, setColor] = useState(C.green);
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
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
      // The team starts with just the owner. Roster management is admin-only:
      // admins add/remove players via the PLAYERS section of the admin panel.
      members: [account.username],
      pendingMembers: [],
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
          <Metric icon={<Hand />} label="SAVES / GAME" value={safeAvg(stats.saves, games)} accent={C.greenLight} />
          <Metric icon={<Shield />} label="CLEAN SHEET %" value={`${safeRate(stats.cleanSheets, games)}%`} accent={C.greenLight} />
          <Metric icon={<Trophy />} label="TOTAL SAVES" value={stats.saves} accent={C.goldLight} />
        </div>
      )}
      {games > 0 && isAttacker && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Target />} label="GOALS / GAME" value={safeAvg(stats.goals, games)} accent={C.redLight} />
          <Metric icon={<Zap />} label="ASSISTS / GAME" value={safeAvg(stats.assists, games)} accent={C.greenLight} />
          <Metric icon={<Footprints />} label="SHOT ACCURACY" value={`${safeRate(stats.shotsOnTarget, stats.shots)}%`} accent={C.redLight} />
          <Metric icon={<Flag />} label="CONVERSION" value={`${safeRate(stats.goals, stats.shots)}%`} accent={C.redLight} />
          <Metric icon={<TrendingUp />} label="G + A" value={stats.goals + stats.assists} accent={C.goldLight} />
        </div>
      )}
      {games > 0 && isMidfielder && !isAttacker && !isDefender && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Zap />} label="ASSISTS / GAME" value={safeAvg(stats.assists, games)} accent={C.greenLight} />
          <Metric icon={<Activity />} label="PASS ACCURACY" value={`${stats.passAccuracy}%`} accent={C.greenLight} />
          <Metric icon={<TrendingUp />} label="PASSES / GAME" value={stats.passes} accent={C.greenLight} />
          <Metric icon={<Shield />} label="TACKLES / GAME" value={safeAvg(stats.tackles, games)} accent={C.redLight} />
          <Metric icon={<Target />} label="GOALS" value={stats.goals} accent={C.redLight} />
        </div>
      )}
      {games > 0 && isDefender && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Shield />} label="TACKLES / GAME" value={safeAvg(stats.tackles, games)} accent={C.redLight} />
          <Metric icon={<Swords />} label="INTERCEPTS / GAME" value={safeAvg(stats.interceptions, games)} accent={C.redLight} />
          <Metric icon={<Trophy />} label="CLEAN SHEET %" value={`${safeRate(stats.cleanSheets, games)}%`} accent={C.greenLight} />
          <Metric icon={<Activity />} label="PASS ACCURACY" value={`${stats.passAccuracy}%`} accent={C.greenLight} />
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

// ============ TEAMS VIEW ============
const TeamsView = ({ account, onUpdate, rankings }) => {
  const [teams, setTeams] = useState([]);
  const [showSubmit, setShowSubmit] = useState(false);
  const [selected, setSelected] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);

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

      {showSubmit && <SubmitTeamModal account={account} onClose={() => setShowSubmit(false)} onSave={refresh} />}

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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {selected.members.map(m => {
                const player = allPlayers.find(p => p.username === m);
                if (!player) return null;
                return (
                  <div key={m} className="flex justify-center">
                    <PlayerCard account={player} size="sm" team={selected} rankings={rankings} />
                  </div>
                );
              })}
            </div>
          </div>
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
    // Roster management is admin-only via the PLAYERS section. On approval we
    // just set the owner's teamId and flip the team to approved.
    const owner = await db.getAccount(team.ownerUsername);
    if (owner && owner.teamId !== team.id) {
      await db.saveAccount({ ...owner, teamId: team.id });
    }
    await db.saveTeam({
      ...team,
      members: [team.ownerUsername],
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

      {section === 'pictures' && (
        <PicturesManager allPlayers={allPlayers} onRefresh={refresh} />
      )}

      {section === 'players' && (
        <PlayersManager allPlayers={allPlayers} allTeams={allTeams} onRefresh={refresh} />
      )}

      {section === 'totw' && (
        <TotwManager allTeams={allTeams} onRefresh={refresh} />
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
          ? { saves: 0, catches: 0, passes: 0, cleanSheet: false }
          : { goals: 0, shots: 0, assists: 0, passes: 0, tackles: 0, interceptions: 0 };
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
                    <StatField label="SAVES"   value={stat.saves}      onChange={(v) => updatePlayerStat(stat.username, 'saves', v)} />
                    <StatField label="CATCHES" value={stat.catches}    onChange={(v) => updatePlayerStat(stat.username, 'catches', v)} />
                    <StatField label="PASSES"  value={stat.passes}     onChange={(v) => updatePlayerStat(stat.username, 'passes', v)} />
                    <ToggleField label="CLEAN SHEET" value={stat.cleanSheet} onChange={(v) => updatePlayerStat(stat.username, 'cleanSheet', v)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <StatField label="GOALS"    value={stat.goals}         onChange={(v) => updatePlayerStat(stat.username, 'goals', v)} />
                    <StatField label="SHOTS"    value={stat.shots}         onChange={(v) => updatePlayerStat(stat.username, 'shots', v)} hint="(total shots taken)" />
                    <StatField label="ASSISTS"  value={stat.assists}       onChange={(v) => updatePlayerStat(stat.username, 'assists', v)} />
                    <StatField label="PASSES"   value={stat.passes}        onChange={(v) => updatePlayerStat(stat.username, 'passes', v)} />
                    <StatField label="TACKLES"  value={stat.tackles}       onChange={(v) => updatePlayerStat(stat.username, 'tackles', v)} />
                    <StatField label="INT"      value={stat.interceptions} onChange={(v) => updatePlayerStat(stat.username, 'interceptions', v)} hint="(interceptions)" />
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
          shots: ps.shots || 0,
          shotsOnTarget: ps.shots || 0, // we no longer track separately
          passes: ps.passes || 0,
          passAccuracy: 0,
          tackles: ps.tackles || 0,
          interceptions: ps.interceptions || 0,
          saves: ps.saves || 0,
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
          shots: (oldStats.shots || 0) + (ps.shots || 0),
          shotsOnTarget: (oldStats.shotsOnTarget || 0) + (ps.shots || 0),
          passes: (oldStats.passes || 0) + (ps.passes || 0),
          tackles: (oldStats.tackles || 0) + (ps.tackles || 0),
          interceptions: (oldStats.interceptions || 0) + (ps.interceptions || 0),
          saves: (oldStats.saves || 0) + (ps.saves || 0),
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
                      <StatField label="SAVES"   value={ps.saves}   onChange={(v) => updateStat(ps.username, 'saves', v)} />
                      <StatField label="CATCHES" value={ps.catches} onChange={(v) => updateStat(ps.username, 'catches', v)} />
                      <StatField label="PASSES"  value={ps.passes}  onChange={(v) => updateStat(ps.username, 'passes', v)} />
                      <ToggleField label="CLEAN SHEET" value={ps.cleanSheet} onChange={(v) => updateStat(ps.username, 'cleanSheet', v)} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <StatField label="GOALS"   value={ps.goals}         onChange={(v) => updateStat(ps.username, 'goals', v)} />
                      <StatField label="SHOTS"   value={ps.shots}         onChange={(v) => updateStat(ps.username, 'shots', v)} />
                      <StatField label="ASSISTS" value={ps.assists}       onChange={(v) => updateStat(ps.username, 'assists', v)} />
                      <StatField label="PASSES"  value={ps.passes}        onChange={(v) => updateStat(ps.username, 'passes', v)} />
                      <StatField label="TACKLES" value={ps.tackles}       onChange={(v) => updateStat(ps.username, 'tackles', v)} />
                      <StatField label="INT"     value={ps.interceptions} onChange={(v) => updateStat(ps.username, 'interceptions', v)} />
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                    {isGK ? (
                      <>
                        <StatLine label="SAVES" value={ps.saves} />
                        <StatLine label="CATCH" value={ps.catches} />
                        <StatLine label="PASS"  value={ps.passes} />
                        <StatLine label="CS"    value={ps.cleanSheet ? '✓' : '—'} />
                      </>
                    ) : (
                      <>
                        <StatLine label="GOAL" value={ps.goals} />
                        <StatLine label="SHOT" value={ps.shots} />
                        <StatLine label="AST"  value={ps.assists} />
                        <StatLine label="PASS" value={ps.passes} />
                        <StatLine label="TKL"  value={ps.tackles} />
                        <StatLine label="INT"  value={ps.interceptions} />
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
const TotwManager = ({ allTeams = [], onRefresh }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  const approvedTeams = allTeams.filter(t => t.status === 'approved');
  const currentTotw = allTeams.find(t => t.totw);

  const setTotw = async (teamId) => {
    setError(''); setInfo(''); setBusy(true);
    try {
      // Clear any existing TOTW team first
      for (const t of allTeams) {
        if (t.totw && t.id !== teamId) {
          await db.saveTeam({ ...t, totw: false, totwSetAt: null });
        }
      }
      // Flag the new team (if teamId is empty, we just cleared above)
      if (teamId) {
        const target = allTeams.find(t => t.id === teamId);
        if (target) {
          await db.saveTeam({ ...target, totw: true, totwSetAt: Date.now() });
          setInfo(`✓ ${target.name} is now Team of the Week`);
        }
      } else {
        setInfo('✓ Team of the Week cleared');
      }
      setPickerOpen(false);
      setSelectedId('');
      onRefresh && onRefresh();
      setTimeout(() => setInfo(''), 4000);
    } catch (e) {
      setError('Could not update TOTW: ' + (e?.message || e));
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, #2196f322 0%, ${C.white} 100%)`,
        border: `1px solid #2196f355`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={14} style={{ color: '#2196f3' }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>TEAM OF THE WEEK</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Pick one team — every player on that team gets a blue "TOTW" marker on their card. Only one team can be TOTW at a time. Stays until you change it.
        </p>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}
      {error && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>
      )}

      {/* CURRENT TOTW */}
      <div className="rounded-lg p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div className="font-mono text-[10px] tracking-[0.25em] mb-2" style={{ color: `${C.brandNavy}77` }}>CURRENT TOTW</div>
        {currentTotw ? (
          <div className="flex items-center gap-3">
            {currentTotw.logoUrl ? (
              <img src={currentTotw.logoUrl} alt="" className="w-12 h-12 rounded-full object-cover" style={{ border: `2px solid #2196f3` }} />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-display text-lg" style={{
                background: currentTotw.color || C.green, color: '#fff', border: `2px solid #2196f3`,
              }}>{currentTotw.tag}</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-heading tracking-wider" style={{ color: C.brandNavy }}>{currentTotw.name.toUpperCase()}</div>
              <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                {(currentTotw.members || []).length} PLAYER{(currentTotw.members || []).length === 1 ? '' : 'S'}
                {currentTotw.totwSetAt && <> · SET {new Date(currentTotw.totwSetAt).toLocaleDateString()}</>}
              </div>
            </div>
            <button
              onClick={() => setTotw('')}
              disabled={busy}
              className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded disabled:opacity-50"
              style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}55` }}
            >REMOVE</button>
          </div>
        ) : (
          <div className="font-mono text-xs tracking-wider" style={{ color: `${C.brandNavy}66` }}>
            NO TEAM OF THE WEEK SET
          </div>
        )}
      </div>

      {/* PICKER */}
      <div className="rounded-lg p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div className="font-mono text-[10px] tracking-[0.25em] mb-2" style={{ color: `${C.brandNavy}77` }}>
          {currentTotw ? 'CHANGE TOTW' : 'PICK TOTW'}
        </div>
        {!pickerOpen ? (
          <button
            onClick={() => setPickerOpen(true)}
            disabled={approvedTeams.length === 0}
            className="w-full py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
            style={{ background: '#2196f3', color: '#fff' }}
          >{approvedTeams.length === 0 ? 'NO APPROVED TEAMS YET' : (currentTotw ? 'PICK A DIFFERENT TEAM' : 'PICK A TEAM')}</button>
        ) : (
          <div className="space-y-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded px-3 py-2 font-body text-sm"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
            >
              <option value="">— Choose a team —</option>
              {approvedTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.tag}) · {(t.members || []).length} players</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => { setPickerOpen(false); setSelectedId(''); }}
                className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
              >CANCEL</button>
              <button
                onClick={() => selectedId && setTotw(selectedId)}
                disabled={!selectedId || busy}
                className="flex-1 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                style={{ background: '#2196f3', color: '#fff' }}
              >{busy ? 'SAVING…' : 'SET AS TOTW'}</button>
            </div>
          </div>
        )}
      </div>
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
      // 2. Add to the new team's roster
      if (newTeamId) {
        const newTeam = teamById(newTeamId);
        if (newTeam && !(newTeam.members || []).some(u => u.toLowerCase() === player.username.toLowerCase())) {
          await db.saveTeam({ ...newTeam, members: [...(newTeam.members || []), player.username] });
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
  const POSITION_STATS = {
    ST:  ['goalsPerGame', 'shotPct', 'assistsPerGame', 'passesPerGame', 'tacklesPerGame', 'interceptionsPerGame'],
    CM:  ['assistsPerGame', 'passesPerGame', 'goalsPerGame', 'tacklesPerGame', 'interceptionsPerGame', 'shotPct'],
    DEF: ['tacklesPerGame', 'interceptionsPerGame', 'assistsPerGame', 'passesPerGame', 'goalsPerGame'],
    GK:  ['savesPerGame', 'cleanSheetPct', 'catchesPerGame'],
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
      link.download = `${account.username}-NAPL-card.png`;
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
      const file = new File([blob], `${account.username}-NAPL-card.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${account.username} — NAPL Player Card`,
          text: `Check out my NAPL player card!`,
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
        ? { games, wins: 13, draws: 2, losses: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passes: 240, passAccuracy: 92, tackles: 0, interceptions: 0, saves: 95, cleanSheets: 13, catches: 30, motm: 0 }
        : { games, wins: 12, draws: 2, losses: 1, goals: 38, assists: 22, shots: 75, shotsOnTarget: 60, passes: 540, passAccuracy: 92, tackles: 22, interceptions: 14, saves: 0, cleanSheets: 0, catches: 0, motm: 0 };
    } else if (targetOverall >= 78) {
      stats = { games, wins: 9, draws: 3, losses: 3, goals: 18, assists: 11, shots: 48, shotsOnTarget: 32, passes: 480, passAccuracy: 84, tackles: 38, interceptions: 22, saves: 0, cleanSheets: 4, catches: 0, motm: 0 };
    } else if (targetOverall >= 68) {
      stats = { games, wins: 7, draws: 3, losses: 5, goals: 8, assists: 6, shots: 30, shotsOnTarget: 16, passes: 360, passAccuracy: 76, tackles: 22, interceptions: 14, saves: 0, cleanSheets: 2, catches: 0, motm: 0 };
    } else {
      stats = { games, wins: 4, draws: 3, losses: 8, goals: 3, assists: 2, shots: 18, shotsOnTarget: 6, passes: 270, passAccuracy: 64, tackles: 12, interceptions: 8, saves: 0, cleanSheets: 1, catches: 0, motm: 0 };
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
            North America Premier League — your official Pro Soccer Online community. Track your career, follow the league, climb the ranks.
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
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [season, setSeason] = useState('all');
  const [currentSeason, setCurrentSeason] = useState('S1');

  const refresh = async () => {
    setAllPlayers(await db.listAccounts());
    setAllTeams(await db.listTeams());
    setCurrentSeason(await db.getSeason());
    setDynamicAdmins(await db.getAdminList());
    setWeightings(await db.getWeightings());
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
  if (isAdmin(account, dynamicAdmins)) tabs.push({ id: 'admin', label: 'ADMIN', icon: Crown });

  return (
    <div className="min-h-screen pitch-bg" style={{ color: C.cream }}>
      <div className="absolute inset-0 pitch-lines opacity-20 pointer-events-none" />

      {/* HEADER */}
      <div className="sticky top-0 z-30 backdrop-blur-md" style={{
        background: `${C.white}ee`,
        borderBottom: `1px solid ${C.navyLight}`,
        boxShadow: `0 2px 12px ${C.brandNavy}11`,
      }}>
        {/* tri-color stripe */}
        <div className="h-1 w-full" style={{
          background: `linear-gradient(90deg, ${C.brandNavy} 0%, ${C.brandNavy} 33%, ${C.green} 33%, ${C.green} 66%, ${C.red} 66%, ${C.red} 100%)`,
        }} />
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <NAPLLogoFull size={32} />
          <div className="flex items-center gap-2">
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="px-2 py-1 font-mono text-[11px] tracking-wider rounded focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
            >
              <option value="all" style={{ background: C.navyDeep }}>ALL TIME</option>
              {allSeasons.map(s => <option key={s} value={s} style={{ background: C.navyDeep }}>{s}</option>)}
            </select>
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded" style={{
              background: `${C.navyLight}33`, border: `1px solid ${C.navyLight}66`,
            }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.greenLight }} />
              <span className="font-mono text-[10px] tracking-wider">@{account.username}</span>
              {isAdmin(account, dynamicAdmins) && <Crown size={10} style={{ color: C.goldLight }} />}
            </div>
            <button
              onClick={onLogout}
              className="px-2 py-1 rounded text-[10px] font-mono tracking-wider flex items-center gap-1 transition-all hover:scale-105"
              style={{ background: `${C.red}22`, color: C.redLight, border: `1px solid ${C.red}44` }}
            ><LogOut size={11} /> EXIT</button>
          </div>
        </div>
        {/* tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-0.5 overflow-x-auto">
          {tabs.map(t => {
            const active = view === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className="px-4 py-2.5 font-heading tracking-wider text-[11px] flex items-center gap-1.5 transition-all whitespace-nowrap relative"
                style={{
                  color: active ? C.cream : `${C.cream}55`,
                }}
              >
                <t.icon size={13} /> {t.label}
                {active && (
                  <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t" style={{
                    background: `linear-gradient(90deg, ${C.green} 0%, ${C.greenLight} 100%)`,
                    boxShadow: `0 0 8px ${C.greenLight}`,
                  }} />
                )}
              </button>
            );
          })}
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
                      <div className="font-heading tracking-wider truncate" style={{ color: C.cream }}>{p.username.toUpperCase()}</div>
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
        const username = session?.user?.user_metadata?.username;
        if (!username) return;
        // Defer the DB call outside the auth callback to avoid the lock deadlock
        setTimeout(async () => {
          try {
            const acc = await db.getAccount(username);
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
            <NAPLCrest size={80} />
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
