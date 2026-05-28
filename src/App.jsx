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
  'Canada', 'United States', 'Mexico', 'United Kingdom', 'Ireland', 'France',
  'Germany', 'Spain', 'Portugal', 'Italy', 'Netherlands', 'Belgium',
  'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Poland', 'Brazil',
  'Argentina', 'Colombia', 'Chile', 'Australia', 'New Zealand', 'Japan',
  'South Korea', 'Nigeria', 'South Africa', 'India', 'Other',
];
const COUNTRY_CODES = {
  'Canada': 'ca', 'United States': 'us', 'Mexico': 'mx',
  'United Kingdom': 'gb', 'Ireland': 'ie', 'France': 'fr',
  'Germany': 'de', 'Spain': 'es', 'Portugal': 'pt', 'Italy': 'it',
  'Netherlands': 'nl', 'Belgium': 'be', 'Switzerland': 'ch',
  'Sweden': 'se', 'Norway': 'no', 'Denmark': 'dk', 'Poland': 'pl',
  'Brazil': 'br', 'Argentina': 'ar', 'Colombia': 'co', 'Chile': 'cl',
  'Australia': 'au', 'New Zealand': 'nz', 'Japan': 'jp',
  'South Korea': 'kr', 'Nigeria': 'ng', 'South Africa': 'za',
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

  // Two-tone palette per tier — these match what FIFA actually uses
  // (lighter fill is the main card body; darker fill is the inner accent band)
  const palette = (() => {
    if (tier.name === 'DIAMOND') return {
      light: '#e6f0f4', mid: '#cbe0e8', dark: '#9ec1cf',
      bandLight: '#dde8ec', bandDark: '#a8c0c8',
      ribbon: 'rgba(255,255,255,0.55)',
      stroke: '#5a7888',
    };
    if (tier.name === 'GOLD') return {
      light: '#ffd84a', mid: '#e8b020', dark: '#a87018',
      bandLight: '#fbe07c', bandDark: '#d99c2b',
      ribbon: 'rgba(255,245,180,0.7)',
      stroke: '#5a3e08',
    };
    if (tier.name === 'SILVER') return {
      light: '#dee2e6', mid: '#b8bcc0', dark: '#8a9098',
      bandLight: '#e6eaee', bandDark: '#a4a8ac',
      ribbon: 'rgba(255,255,255,0.55)',
      stroke: '#4a4e54',
    };
    return {
      light: '#d18a4a', mid: '#a85c20', dark: '#6e3c10',
      bandLight: '#dba068', mid2: '#a85c20', bandDark: '#7a4818',
      ribbon: 'rgba(255,210,170,0.55)',
      stroke: '#3a1e08',
    };
  })();

  const VB_W = 320, VB_H = 510; // Internal SVG viewBox so coordinates stay consistent

  // FIFA-style card outline — coat-of-arms shape:
  // Curved shoulders at the top, slight inward curve at the sides, pointed bottom.
  const cardPath = `
    M 30 0
    L 290 0
    Q 320 0 320 30
    L 320 320
    Q 320 360 300 380
    L 220 470
    Q 200 495 160 510
    Q 120 495 100 470
    L 20 380
    Q 0 360 0 320
    L 0 30
    Q 0 0 30 0
    Z
  `;

  // Inner stat band — the lighter colored panel where name/stats sit
  const bandPath = `
    M 12 290
    L 308 290
    L 308 380
    Q 308 410 290 425
    L 220 490
    Q 200 502 160 510
    Q 120 502 100 490
    L 30 425
    Q 12 410 12 380
    Z
  `;

  const cardFrontSvg = (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={dims.w}
      height={dims.h}
      style={{ display: 'block' }}
    >
      <defs>
        {/* Main card gradient — light at top, mid in middle, dark at bottom */}
          <linearGradient id={`card-bg-${overall}-${tier.name}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.light} />
            <stop offset="50%" stopColor={palette.mid} />
            <stop offset="100%" stopColor={palette.dark} />
          </linearGradient>
          {/* Stat band gradient */}
          <linearGradient id={`band-bg-${overall}-${tier.name}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.bandLight} />
            <stop offset="100%" stopColor={palette.bandDark} />
          </linearGradient>
          {/* Player image clip — confined to the upper area only */}
          <clipPath id={`portrait-clip-${overall}`}>
            <path d="M 130 30 L 290 30 Q 308 30 308 50 L 308 280 L 110 280 Z" />
          </clipPath>
          {/* Card-shaped clip for image fallback (so initial letter doesn't bleed past) */}
          <clipPath id={`card-clip-${overall}`}>
            <path d={cardPath} />
          </clipPath>
          {/* Photo fade mask — white = visible, black = transparent.
              Soft fade on the LEFT edge of the photo (so it blends into the
              OVR/crest column instead of looking pasted on), plus subtle
              softening at the TOP and BOTTOM. */}
          <linearGradient id={`photo-fade-x-${overall}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="#888" />
            <stop offset="18%" stopColor="#fff" />
          </linearGradient>
          <linearGradient id={`photo-fade-y-${overall}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#aaa" />
            <stop offset="10%" stopColor="#fff" />
            <stop offset="88%" stopColor="#fff" />
            <stop offset="100%" stopColor="#888" />
          </linearGradient>
          <mask id={`photo-mask-${overall}`} maskUnits="userSpaceOnUse">
            {/* Two-axis fade: stack a vertical fade with a horizontal one set to
                multiply, yielding a soft vignette where black areas hide the
                photo and white areas keep it fully visible. */}
            <rect x="100" y="15" width="220" height="285" fill={`url(#photo-fade-y-${overall})`} />
            <rect x="100" y="15" width="220" height="285" fill={`url(#photo-fade-x-${overall})`} style={{ mixBlendMode: 'multiply' }} />
          </mask>
        </defs>

        {/* MAIN CARD BODY */}
        <path d={cardPath} fill={`url(#card-bg-${overall}-${tier.name})`} stroke={palette.stroke} strokeWidth="1.5" strokeOpacity="0.4" />

        {/* DIAGONAL RIBBONS — characteristic FIFA flourishes. Clipped to the
            left column (behind the OVR/badge stack) so they don't run across
            the player photo on the right. */}
        <clipPath id={`ribbon-clip-${overall}`}>
          <rect x="0" y="0" width="105" height="300" />
        </clipPath>
        <g clipPath={`url(#ribbon-clip-${overall})`} opacity="0.5">
          <path d="M -20 60 Q 100 100 320 50 L 320 80 Q 100 130 -20 90 Z" fill={palette.ribbon} />
          <path d="M -20 130 Q 100 170 320 120 L 320 145 Q 100 195 -20 155 Z" fill={palette.ribbon} opacity="0.6" />
          <path d="M -20 200 Q 100 240 320 190 L 320 215 Q 100 265 -20 225 Z" fill={palette.ribbon} opacity="0.4" />
        </g>

        {/* PLAYER IMAGE / FALLBACK — fills the right side of the upper area */}
        <g clipPath={`url(#portrait-clip-${overall})`}>
          {account.imageUrl ? (
            <image
              href={account.imageUrl}
              x="110" y="20"
              width="200" height="270"
              preserveAspectRatio="xMidYMin slice"
              mask={`url(#photo-mask-${overall})`}
            />
          ) : (
            <text
              x="220" y="200"
              fontFamily="Anton, sans-serif"
              fontSize="180"
              fill={palette.dark}
              opacity="0.18"
              textAnchor="middle"
            >{account.username.charAt(0).toUpperCase()}</text>
          )}
        </g>

        {/* OVR — big, top-left */}
        <text
          x="55" y="65"
          fontFamily="Anton, sans-serif"
          fontSize="56"
          fill={palette.stroke}
          textAnchor="middle"
        >{displayOverall}</text>
        {/* POSITION — directly below OVR, smaller */}
        <text
          x="55" y="92"
          fontFamily="Anton, sans-serif"
          fontSize="22"
          fill={palette.stroke}
          textAnchor="middle"
        >{account.position}</text>

        {/* UNRANKED tag — shown until the player has 3 games. Explains the 0s. */}
        {showZeroStats && (
          <text
            x="160" y="300"
            fontFamily="Russo One, sans-serif"
            fontSize={size === 'lg' ? '11' : '9'}
            fill={palette.stroke}
            opacity="0.75"
            textAnchor="middle"
            letterSpacing="1.5"
          >UNRANKED · {games}/{3} GAMES</text>
        )}

        {/* NAPL crest — full league badge (already has its own white field
            and navy border, so no extra backing shape is needed). */}
        <image
          href={NAPL_LOGO_SRC}
          x="33" y="104"
          width="44" height="48"
          preserveAspectRatio="xMidYMid meet"
        />

        {/* TEAM LOGO SLOT — always reserved square. Shows the team logo/tag
            when the player is on a team, or a "FREE AGENT" badge when not. */}
        <rect x="34" y="166" width="42" height="42" rx="3"
          fill={team?.logoUrl ? 'transparent' : (team ? (team.color || palette.dark) : '#ffffff')}
          fillOpacity={team ? 1 : 0.9}
          stroke={team ? 'none' : palette.stroke}
          strokeWidth="1"
          strokeOpacity="0.3"
        />
        {team?.logoUrl ? (
          <image
            href={team.logoUrl}
            x="34" y="166"
            width="42" height="42"
            preserveAspectRatio="xMidYMid meet"
          />
        ) : team ? (
          <text
            x="55" y="194"
            fontFamily="Russo One, sans-serif"
            fontSize="14"
            fill="#ffffff"
            textAnchor="middle"
            letterSpacing="1"
          >{team.tag}</text>
        ) : (
          // FREE AGENT — no team. Two short lines fit the 42px square.
          <g>
            <text x="55" y="184" fontFamily="Russo One, sans-serif" fontSize="9"
              fill={palette.stroke} textAnchor="middle" letterSpacing="0.5">FREE</text>
            <text x="55" y="196" fontFamily="Russo One, sans-serif" fontSize="9"
              fill={palette.stroke} textAnchor="middle" letterSpacing="0.5">AGENT</text>
          </g>
        )}

        {/* COUNTRY FLAG — below the team logo slot */}
        {account.country && flagUrl(account.country) && (
          <g>
            {/* white rounded backing so the flag reads on any tier color */}
            <rect x="35" y="224" width="40" height="28" rx="3"
              fill="#ffffff" stroke={palette.stroke} strokeWidth="0.8" strokeOpacity="0.35" />
            <image
              href={flagUrl(account.country)}
              x="37" y="226" width="36" height="24"
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        )}

        {/* INNER STAT BAND */}
        <path d={bandPath} fill={`url(#band-bg-${overall}-${tier.name})`} stroke={palette.stroke} strokeWidth="1" strokeOpacity="0.3" />

        {/* NAME — across the top of the band, with a thin line under.
            Award winners get a black "label" bar behind the name; the name
            text keeps the tier color so you can still read their tier at a glance. */}
        {hasAwards && (() => {
          // Tier-colored text for the name on the black bar
          const tierTextColor =
            tier.name === 'DIAMOND' ? '#bfe4f0' :
            tier.name === 'GOLD'    ? '#f5cc3e' :
            tier.name === 'SILVER'  ? '#dfe4e8' :
                                      '#d99c5c'; // bronze
          return (
            // Clip to the card shape so the bar follows the narrowing card edges
            <g clipPath={`url(#card-clip-${overall})`}>
              {/* Black label bar — spans the full available width at y=305. */}
              <rect x="0" y="305" width="320" height="26"
                fill="#0a0a0e" />
              {/* thin gold sheen lines top + bottom of the bar */}
              <rect x="0" y="306" width="320" height="2"
                fill="#d4af37" fillOpacity="0.45" />
              <rect x="0" y="328" width="320" height="1.5"
                fill="#d4af37" fillOpacity="0.3" />
            </g>
          );
        })()}
        <text
          x="160" y={hasAwards ? 319 : 324}
          fontFamily="Anton, sans-serif"
          fontSize="22"
          fill={hasAwards
            ? (tier.name === 'DIAMOND' ? '#bfe4f0'
             : tier.name === 'GOLD'    ? '#f5cc3e'
             : tier.name === 'SILVER'  ? '#dfe4e8'
             : '#d99c5c')
            : palette.stroke}
          textAnchor="middle"
          dominantBaseline={hasAwards ? 'central' : 'auto'}
          letterSpacing="2"
        >{account.username.toUpperCase().slice(0, 14)}</text>
        {!hasAwards && (
          <line x1="50" y1="332" x2="270" y2="332" stroke={palette.stroke} strokeWidth="1" strokeOpacity="0.4" />
        )}

        {/* STATS — two columns, classic FIFA layout */}
        {(() => {
          const isGK = account.position === 'GK';
          // displayStats is zeroed for players with fewer than 3 games
          const fmtPerGame = (n) => games > 0 && !showZeroStats ? (n / games).toFixed(1) : '0.0';
          const leftStats = isGK
            ? [
                ['SAVES', fmtPerGame(displayStats.saves || 0)],
                ['CATCH', fmtPerGame(displayStats.catches || 0)],
                ['CLEAN', displayStats.cleanSheets || 0],
              ]
            : [
                ['GOALS', displayStats.goals || 0],
                ['ASSIST', displayStats.assists || 0],
                ['PASS',  fmtPerGame(displayStats.passes || 0)],
              ];
          const rightStats = isGK
            ? [['GAMES', games]]
            : [
                ['SHO%', (displayStats.shots || 0) > 0 ? Math.round(((displayStats.goals || 0) / displayStats.shots) * 100) : 0],
                ['TKL',  fmtPerGame(displayStats.tackles || 0)],
                ['INT',  fmtPerGame(displayStats.interceptions || 0)],
              ];
          const startY = 360;
          const rowGap = 26;
          return (
            <>
              {leftStats.map(([lbl, val], i) => (
                <g key={`l-${i}`}>
                  <text x="100" y={startY + i * rowGap}
                    fontFamily="Russo One, sans-serif" fontSize="18" fill={palette.stroke}
                    textAnchor="end">{val}</text>
                  <text x="108" y={startY + i * rowGap}
                    fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.stroke} opacity="0.7"
                    textAnchor="start" letterSpacing="1.5">{lbl}</text>
                </g>
              ))}
              {/* Vertical divider between columns */}
              <line x1="160" y1={startY - 16} x2="160" y2={startY + (leftStats.length - 1) * rowGap + 6}
                stroke={palette.stroke} strokeWidth="1" strokeOpacity="0.3" />
              {rightStats.map(([lbl, val], i) => (
                <g key={`r-${i}`}>
                  <text x="220" y={startY + i * rowGap}
                    fontFamily="Russo One, sans-serif" fontSize="18" fill={palette.stroke}
                    textAnchor="end">{val}</text>
                  <text x="228" y={startY + i * rowGap}
                    fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.stroke} opacity="0.7"
                    textAnchor="start" letterSpacing="1.5">{lbl}</text>
                </g>
              ))}
            </>
          );
        })()}

        {/* TIER BADGE — top-right corner of the card body */}
        <g transform={`translate(260, 26)`}>
          <polygon
            points="-22,-10 22,-10 28,0 22,10 -22,10 -28,0"
            fill={palette.bandLight}
            stroke={palette.stroke}
            strokeWidth="0.7"
            strokeOpacity="0.5"
          />
          <text
            x="0" y="3"
            fontFamily="Russo One, sans-serif"
            fontSize="9"
            fill={palette.stroke}
            textAnchor="middle"
            letterSpacing="1.5"
          >{tier.name}</text>
        </g>
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
        <linearGradient id={`back-bg-${overall}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.mid} />
          <stop offset="100%" stopColor={palette.dark} />
        </linearGradient>
      </defs>

      {/* card body — same shape, tier-toned */}
      <path d={cardPath} fill={`url(#back-bg-${overall})`} stroke={palette.stroke} strokeWidth="1.5" strokeOpacity="0.4" />

      {/* dark inner panel so text reads cleanly. The pivot is shifted DOWN
          (y=300, not the geometric center y=255) so the inset extends further
          into the pointed chin area — keeping "MEMBER SINCE" fully on the
          dark panel instead of straddling the tier-colored edge. */}
      <g transform="translate(160 300) scale(0.93) translate(-160 -300)">
        <path d={cardPath} fill="#0d1018" fillOpacity="0.92" />
      </g>
      {/* thin gold frame just inside the card edge */}
      <path d={cardPath} fill="none" stroke="#d4af37" strokeWidth="1.5" strokeOpacity="0.55" />

      {/* header — text is white so it reads on the dark inner panel.
          (C.cream is actually navy in this codebase; we use #ffffff explicitly here.) */}
      <text x="160" y="62" fontFamily="Anton, sans-serif" fontSize="24"
        fill="#ffffff" textAnchor="middle" letterSpacing="2">
        {account.username.toUpperCase().slice(0, 14)}
      </text>
      <text x="160" y="80" fontFamily="JetBrains Mono, monospace" fontSize="9"
        fill="#ffffffaa" textAnchor="middle" letterSpacing="3">
        {account.position} • CAREER RECORD
      </text>
      <line x1="50" y1="92" x2="270" y2="92" stroke="#d4af37" strokeWidth="1" strokeOpacity="0.5" />

      {/* TROPHIES section */}
      <text x="160" y="120" fontFamily="Russo One, sans-serif" fontSize="13"
        fill="#d4af37" textAnchor="middle" letterSpacing="2">TROPHY CABINET</text>

      {cabinetItems.length === 0 ? (
        <text x="160" y="155" fontFamily="Barlow Condensed, sans-serif" fontSize="14"
          fill="#ffffff88" textAnchor="middle">No awards yet — keep grinding.</text>
      ) : (
        cabinetItems.map((item, i) => {
          const rowY = 138 + i * 28;

          // Shared gold gradient (used by award icons). Each row gets a unique id.
          const gid = `cab-grad-${i}`;
          const grad = (
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fce98a" />
                <stop offset="40%" stopColor="#f5cc3e" />
                <stop offset="100%" stopColor="#8a6914" />
              </linearGradient>
              {/* silver gradient — only used by runner-up rows */}
              <linearGradient id={`${gid}-silver`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f5f7fa" />
                <stop offset="50%" stopColor="#cdd3dc" />
                <stop offset="100%" stopColor="#7a8290" />
              </linearGradient>
            </defs>
          );

          // CHAMPIONSHIP TROPHY ROW (winner = gold cup, runner_up = silver cup)
          if (item.kind === 'champ') {
            const isSilver = item.placement === 'runner_up';
            const tgid = isSilver ? `${gid}-silver` : gid;
            const stroke = isSilver ? '#4a4e54' : '#5c4710';
            const shine = isSilver ? '#ffffff' : '#fff5b8';
            const label = isSilver ? 'Runner-Up' : 'Champion';
            // Trophy is in 100x120 viewBox; row icon area is ~24px wide.
            // Scale 0.2 fits and centers the cup vertically in the 24px row.
            return (
              <g key={i} transform={`translate(40 ${rowY})`}>
                {grad}
                <g transform="translate(0 -4) scale(0.22)">
                  {/* Square base */}
                  <rect x="28" y="108" width="44" height="10" rx="1.5" fill={`url(#${tgid})`} stroke={stroke} strokeWidth="0.8" />
                  <rect x="32" y="100" width="36" height="10" rx="1" fill={`url(#${tgid})`} stroke={stroke} strokeWidth="0.8" />
                  {/* Stem */}
                  <rect x="44" y="86" width="12" height="16" fill={`url(#${tgid})`} stroke={stroke} strokeWidth="0.8" />
                  {/* Stem flare */}
                  <path d="M 38 86 L 62 86 L 58 78 L 42 78 Z" fill={`url(#${tgid})`} stroke={stroke} strokeWidth="0.8" />
                  {/* Cup */}
                  <path d="M 28 22 L 72 22 L 72 40 Q 72 70 50 78 Q 28 70 28 40 Z" fill={`url(#${tgid})`} stroke={stroke} strokeWidth="1" />
                  {/* Rim */}
                  <rect x="25" y="18" width="50" height="6" rx="1" fill={`url(#${tgid})`} stroke={stroke} strokeWidth="0.8" />
                  {/* Handles */}
                  <path d="M 28 28 Q 12 28 12 42 Q 12 56 28 56" fill="none" stroke={`url(#${tgid})`} strokeWidth="5" strokeLinecap="round" />
                  <path d="M 72 28 Q 88 28 88 42 Q 88 56 72 56" fill="none" stroke={`url(#${tgid})`} strokeWidth="5" strokeLinecap="round" />
                  {/* Highlight */}
                  <ellipse cx="42" cy="35" rx="6" ry="14" fill={shine} opacity="0.45" />
                </g>
                <text x="30" y="13" fontFamily="Barlow Condensed, sans-serif" fontSize="14"
                  fill="#ffffff" letterSpacing="0.5">
                  {label}
                </text>
                {item.season && (
                  <text x="240" y="13" fontFamily="JetBrains Mono, monospace" fontSize="10"
                    fill={isSilver ? '#cdd3dc' : '#d4af37'} textAnchor="end">{item.season}</text>
                )}
              </g>
            );
          }

          // INDIVIDUAL AWARD ROW (Golden Glove, Striker, Defender, Playmaker)
          const renderIcon = () => {
            if (item.awardId === 'striker') {
              return (<g transform="translate(0 -3) scale(0.7)">{grad}
                <path d="M 28 22 L 28 24 Q 28 25.5 26.5 25.5 L 5 25.5 Q 3.5 25.5 3.5 24 L 3.5 21 Q 3.5 19 6 18.5 Q 8 18 10 16.5 Q 11 15 11 13 Q 11 11.5 12.5 11.5 L 15 11.5 Q 16.5 11.5 17 13 L 17.5 16 Q 18 17.5 19.5 17.5 L 25 17.5 Q 28 17.5 28 20 Z"
                      fill={`url(#${gid})`} stroke="#5c4710" strokeWidth="0.7" strokeLinejoin="round" />
                <path d="M 12.5 12.5 Q 14 14 16.5 14 L 18 14" fill="none" stroke="#5c4710" strokeWidth="0.6" opacity="0.55" />
                <path d="M 14 17 L 16.5 19" stroke="#5c4710" strokeWidth="0.7" strokeLinecap="round" opacity="0.75" />
                <path d="M 16 17.5 L 18.5 19.5" stroke="#5c4710" strokeWidth="0.7" strokeLinecap="round" opacity="0.75" />
                <path d="M 18 18 L 20.5 20" stroke="#5c4710" strokeWidth="0.7" strokeLinecap="round" opacity="0.75" />
                <rect x="6" y="25.5" width="2" height="2" rx="0.3" fill="#5c4710" />
                <rect x="12" y="25.5" width="2" height="2" rx="0.3" fill="#5c4710" />
                <rect x="18" y="25.5" width="2" height="2" rx="0.3" fill="#5c4710" />
                <rect x="24" y="25.5" width="2" height="2" rx="0.3" fill="#5c4710" />
              </g>);
            }
            if (item.awardId === 'glove') {
              return (<g transform="translate(0 -3) scale(0.7)">{grad}
                <path d="M9 6 Q9 3 12 3 L20 3 Q23 3 23 6 L23 14 L25 14 Q27 14 27 16 L27 20 Q27 22 25 22 L23 22 L23 26 Q23 28 21 28 L11 28 Q9 28 9 26 Z" fill={`url(#${gid})`} stroke="#5c4710" strokeWidth="0.8" />
                <path d="M12 6 L12 14 M16 6 L16 14 M20 6 L20 14" stroke="#5c4710" strokeWidth="0.6" fill="none" opacity="0.5" />
              </g>);
            }
            if (item.awardId === 'defender') {
              return (<g transform="translate(0 -3) scale(0.7)">{grad}
                <path d="M16 3 L26 6 L26 16 Q26 24 16 29 Q6 24 6 16 L6 6 Z" fill={`url(#${gid})`} stroke="#5c4710" strokeWidth="0.8" />
                <path d="M16 10 L19 14 L23 14 L20 17 L21 21 L16 19 L11 21 L12 17 L9 14 L13 14 Z" fill="#5c4710" opacity="0.7" />
              </g>);
            }
            if (item.awardId === 'playmaker') {
              return (<g transform="translate(0 -3) scale(0.7)">{grad}
                <path d="M 16 3 L 19.5 12.2 L 29 12.6 L 21.5 18.6 L 24.2 28 L 16 22.7 L 7.8 28 L 10.5 18.6 L 3 12.6 L 12.5 12.2 Z"
                      fill={`url(#${gid})`} stroke="#5c4710" strokeWidth="0.8" strokeLinejoin="round" />
                <path d="M 16 3 L 19.5 12.2 L 16 12 L 12.5 12.2 Z" fill="#fce98a" opacity="0.55" />
              </g>);
            }
            return null;
          };
          return (
            <g key={i} transform={`translate(40 ${rowY})`}>
              {renderIcon()}
              <text x="30" y="13" fontFamily="Barlow Condensed, sans-serif" fontSize="14"
                fill="#ffffff" letterSpacing="0.5">
                {AWARD_FULL_NAMES[item.awardId] || 'Award'}
              </text>
              {item.season && (
                <text x="240" y="13" fontFamily="JetBrains Mono, monospace" fontSize="10"
                  fill="#d4af37" textAnchor="end">{item.season}</text>
              )}
            </g>
          );
        })
      )}

      {/* JOIN DATE footer — raised so it sits cleanly inside the dark inset
          rather than straddling the tier-colored chin of the card */}
      <line x1="50" y1="425" x2="270" y2="425" stroke="#ffffff33" strokeWidth="1" />
      <text x="160" y="443" fontFamily="JetBrains Mono, monospace" fontSize="9"
        fill="#ffffff88" textAnchor="middle" letterSpacing="2">MEMBER SINCE</text>
      <text x="160" y="460" fontFamily="Barlow Condensed, sans-serif" fontSize="13"
        fill="#ffffff" textAnchor="middle">{joinDate}</text>
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
const SubmitTeamModal = ({ account, allPlayers = [], allTeams = [], onClose, onSave }) => {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [color, setColor] = useState(C.green);
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]); // usernames, excludes owner
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const logoInputRef = useRef(null);

  // Players available to add: everyone except the owner and anyone already on
  // an (approved or pending) team. Map username -> the team they're locked to.
  const lockedTeamByUser = useMemo(() => {
    const map = {};
    allTeams.forEach(t => {
      if (t.status === 'approved' || t.status === 'pending') {
        (t.members || []).forEach(u => { map[u.toLowerCase()] = t; });
        (t.pendingMembers || []).forEach(u => { map[u.toLowerCase()] = t; });
      }
    });
    return map;
  }, [allTeams]);

  const candidatePlayers = useMemo(
    () => allPlayers
      .filter(p => p.username.toLowerCase() !== account.username.toLowerCase())
      .sort((a, b) => a.username.localeCompare(b.username)),
    [allPlayers, account.username]
  );

  const toggleMember = (username) => {
    setSelectedMembers(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
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
      members: [account.username],
      // Players the creator invited. They are only added to `members` (and get
      // their teamId set) once an admin approves the team.
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

        {/* ROSTER PICKER — invite players to the team. Players already on a
            team (approved or pending) are locked and can't be selected. The
            invited players only join once an admin approves the team. */}
        <div>
          <Lbl>INVITE PLAYERS (OPTIONAL)</Lbl>
          <div className="rounded-lg max-h-48 overflow-y-auto" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66` }}>
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
              {selectedMembers.length} player{selectedMembers.length === 1 ? '' : 's'} invited (joins on approval)
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
              {!selected.members.includes(account.username) && !account.teamId && (
                <button onClick={() => joinTeam(selected)} className="px-4 py-2 font-heading tracking-wider text-xs rounded" style={{
                  background: C.green, color: C.onColor,
                }}>JOIN TEAM</button>
              )}
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
    // Pull in players the creator invited (pendingMembers), but only those who
    // are still free agents — skip anyone who joined another team in the
    // meantime. Each added player gets their teamId set.
    const invited = team.pendingMembers || [];
    const finalMembers = [...new Set(team.members || [team.ownerUsername])];
    for (const username of invited) {
      const player = await db.getAccount(username);
      if (player && !player.teamId) {
        if (!finalMembers.includes(player.username)) finalMembers.push(player.username);
        await db.saveAccount({ ...player, teamId: team.id });
      }
    }
    // The owner should also have their teamId set to this team.
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
                        <button onClick={() => removeTeam(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded" style={{
                          background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66`,
                        }}>DELETE</button>
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
export default function App() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

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
      if (event === 'SIGNED_OUT') {
        setAccount(null);
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
    </>
  );
}
