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
            <stop offset="0%"  stopColor="#000" />
            <stop offset="25%" stopColor="#666" />
            <stop offset="55%" stopColor="#fff" />
          </linearGradient>
          <linearGradient id={`photo-fade-y-${overall}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#444" />
            <stop offset="15%" stopColor="#fff" />
            <stop offset="80%" stopColor="#fff" />
            <stop offset="100%" stopColor="#333" />
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

        {/* DIAGONAL RIBBONS — characteristic FIFA flourishes wrapping behind the player */}
        <g clipPath={`url(#card-clip-${overall})`} opacity="0.85">
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

        {/* NAPL crest — below position. White circular badge behind it
            so the transparent PNG reads cleanly on any tier color. */}
        <circle cx="55" cy="126" r="24" fill="#ffffff" stroke={palette.stroke} strokeWidth="0.8" strokeOpacity="0.35" />
        <image
          href={NAPL_LOGO_SRC}
          x="34" y="105"
          width="42" height="42"
          preserveAspectRatio="xMidYMid meet"
        />

        {/* TEAM LOGO SLOT — always reserved square */}
        <rect x="34" y="155" width="42" height="42" rx="3"
          fill={team?.logoUrl ? 'transparent' : (team ? (team.color || palette.dark) : 'none')}
          stroke={team ? 'none' : palette.stroke}
          strokeWidth="1"
          strokeDasharray={team ? '0' : '3 2'}
          strokeOpacity="0.3"
        />
        {team?.logoUrl ? (
          <image
            href={team.logoUrl}
            x="34" y="155"
            width="42" height="42"
            preserveAspectRatio="xMidYMid meet"
          />
        ) : team ? (
          <text
            x="55" y="183"
            fontFamily="Russo One, sans-serif"
            fontSize="14"
            fill="#ffffff"
            textAnchor="middle"
            letterSpacing="1"
          >{team.tag}</text>
        ) : null}

        {/* COUNTRY FLAG — below the team logo slot */}
        {account.country && flagUrl(account.country) && (
          <g>
            {/* white rounded backing so the flag reads on any tier color */}
            <rect x="35" y="205" width="40" height="28" rx="3"
              fill="#ffffff" stroke={palette.stroke} strokeWidth="0.8" strokeOpacity="0.35" />
            <image
              href={flagUrl(account.country)}
              x="37" y="207" width="36" height="24"
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
            <g>
              {/* black label bar */}
              <rect x="40" y="305" width="240" height="26" rx="4"
                fill="#0a0a0e" stroke="#d4af37" strokeWidth="1" strokeOpacity="0.8" />
              {/* thin gold sheen line on top of the bar */}
              <rect x="44" y="308" width="232" height="2" rx="1"
                fill="#d4af37" fillOpacity="0.4" />
            </g>
          );
        })()}
        <text
          x="160" y="320"
          fontFamily="Anton, sans-serif"
          fontSize="22"
          fill={hasAwards
            ? (tier.name === 'DIAMOND' ? '#bfe4f0'
             : tier.name === 'GOLD'    ? '#f5cc3e'
             : tier.name === 'SILVER'  ? '#dfe4e8'
             : '#d99c5c')
            : palette.stroke}
          textAnchor="middle"
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

      {/* header */}
      <text x="160" y="62" fontFamily="Anton, sans-serif" fontSize="24"
        fill={C.cream} textAnchor="middle" letterSpacing="2">
        {account.username.toUpperCase().slice(0, 14)}
      </text>
      <text x="160" y="80" fontFamily="JetBrains Mono, monospace" fontSize="9"
        fill={`${C.cream}88`} textAnchor="middle" letterSpacing="3">
        {account.position} • CAREER RECORD
      </text>
      <line x1="50" y1="92" x2="270" y2="92" stroke="#d4af37" strokeWidth="1" strokeOpacity="0.5" />

      {/* TROPHIES section */}
      <text x="160" y="120" fontFamily="Russo One, sans-serif" fontSize="13"
        fill="#d4af37" textAnchor="middle" letterSpacing="2">TROPHY CABINET</text>

      {cabinetItems.length === 0 ? (
        <text x="160" y="155" fontFamily="Barlow Condensed, sans-serif" fontSize="14"
          fill={`${C.cream}66`} textAnchor="middle">No awards yet — keep grinding.</text>
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
                  fill={C.cream} letterSpacing="0.5">
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
                fill={C.cream} letterSpacing="0.5">
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
      <line x1="50" y1="425" x2="270" y2="425" stroke={`${C.cream}33`} strokeWidth="1" />
      <text x="160" y="443" fontFamily="JetBrains Mono, monospace" fontSize="9"
        fill={`${C.cream}66`} textAnchor="middle" letterSpacing="2">MEMBER SINCE</text>
      <text x="160" y="460" fontFamily="Barlow Condensed, sans-serif" fontSize="13"
        fill={C.cream} textAnchor="middle">{joinDate}</text>
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
      members: [account.username],
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
  };
  useEffect(() => { refresh(); }, []);

  const approve = async (team) => {
    await db.saveTeam({ ...team, status: 'approved', reviewedAt: Date.now(), reviewedBy: account.username, rejectionReason: null });
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
        <PlayersManager allPlayers={allPlayers} onRefresh={refresh} />
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


// ============ PLAYERS MANAGER (admin: rename players) ============
const PlayersManager = ({ allPlayers, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);   // account being renamed
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

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
          Rename any player — useful for cleaning up inappropriate usernames. The player keeps all their stats, team, and awards.
        </p>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
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
        ) : filtered.map(p => (
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
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>
                    {p.username.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                    {p.position} • {p.stats?.games || 0} GAMES
                  </div>
                </div>
                <button
                  onClick={() => startEdit(p)}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1.5"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                ><Edit3 size={11} /> RENAME</button>
              </div>
            )}
          </div>
        ))}
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
// Tries to use html-to-image if globally available (e.g. when deployed with
// the package installed). Falls back to a friendly message in the artifact
// preview where loading external scripts is blocked.
const getHtmlToImage = () => (typeof window !== 'undefined' ? window.htmlToImage : null);

const ShareableCardModal = ({ account, team, onClose }) => {
  const cardRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    if (!cardRef.current) return;
    const lib = getHtmlToImage();
    if (!lib) {
      setError('Image export will be enabled when the app is deployed.');
      return;
    }
    setDownloading(true);
    setError('');
    try {
      const dataUrl = await lib.toPng(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: 'transparent',
      });
      const link = document.createElement('a');
      link.download = `${account.username}-NAPL-card.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      setError('Could not generate image. Try again.');
    }
    setDownloading(false);
  };

  const handleCopyLink = async () => {
    setError('');
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
    if (!cardRef.current) return;
    const lib = getHtmlToImage();
    if (!lib || !navigator.share) {
      return handleDownload();
    }
    setError('');
    try {
      const blob = await lib.toBlob(cardRef.current, { pixelRatio: 3, cacheBust: true });
      const file = new File([blob], `${account.username}-NAPL-card.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${account.username} — NAPL Player Card`,
          text: `Check out my NAPL player card!`,
        });
      } else {
        handleDownload();
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError('Could not share. Try downloading instead.');
      }
    }
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
            {account.email ? (
              <div className="font-body text-sm" style={{ color: C.brandNavy }}>{account.email}</div>
            ) : addingEmail ? (
              <div className="space-y-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 font-body text-sm focus:outline-none rounded"
                  style={{ background: C.cream, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
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
            {account.country ? (
              <div className="flex items-center gap-2">
                {flagUrl(account.country) && (
                  <img src={flagUrl(account.country)} alt="" style={{ width: 24, height: 16, objectFit: 'cover', borderRadius: 2, border: `1px solid ${C.navyLight}` }} />
                )}
                <span className="font-body text-sm" style={{ color: C.brandNavy }}>{account.country}</span>
              </div>
            ) : (
              <div className="font-body text-sm italic" style={{ color: `${C.brandNavy}66` }}>Not set</div>
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
        return { ...p, _seasonStats: s, _attrs: attrs, _overall: calcOverall(attrs, p.position), _team: allTeams.find(t => t.id === p.teamId && t.status === 'approved') };
      })
      .sort((a, b) => b._overall - a._overall),
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
                <span className="font-mono text-[10px] tracking-[0.25em]" style={{ color: `${C.cream}99` }}>VIEWING STATS FOR</span>
                <span className="font-display text-xl tracking-wider" style={{ color: C.goldLight }}>
                  {season === 'all' ? 'ALL TIME' : `SEASON ${season}`}
                </span>
              </div>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setSeason('all')}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded transition-all"
                  style={{
                    background: season === 'all' ? C.goldLight : `${C.navyDeep}88`,
                    color: season === 'all' ? C.brandNavy : `${C.cream}99`,
                    border: `1px solid ${season === 'all' ? C.goldLight : C.navyLight}66`,
                  }}
                >ALL TIME</button>
                {allSeasons.map(s => (
                  <button
                    key={s}
                    onClick={() => setSeason(s)}
                    className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded transition-all"
                    style={{
                      background: season === s ? C.goldLight : `${C.navyDeep}88`,
                      color: season === s ? C.brandNavy : `${C.cream}99`,
                      border: `1px solid ${season === s ? C.goldLight : C.navyLight}66`,
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
                const rankColor = i === 0 ? C.goldLight : i === 1 ? '#c4c4c4' : i === 2 ? '#c08555' : `${C.cream}55`;
                return (
                  <button
                    key={p.username}
                    onClick={() => setSelectedPlayer({ ...p, stats: p._seasonStats })}
                    className="w-full rounded-lg p-3 flex items-center gap-4 transition-all hover:translate-x-1 hover:scale-[1.005]"
                    style={{
                      background: i < 3 ? `linear-gradient(90deg, ${rankColor}11 0%, ${C.navyDeep}aa 30%)` : `${C.navyDeep}aa`,
                      border: `1px solid ${i < 3 ? rankColor : C.navyLight}44`,
                    }}
                  >
                    <div className="font-display text-3xl w-10 text-center" style={{ color: rankColor }}>
                      {i + 1}
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
                    <div className="font-display text-3xl" style={{ color: C.greenLight, textShadow: `0 0 12px ${C.green}` }}>{p._overall}</div>
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
