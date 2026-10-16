import type { Account,Team } from '../api/models';
import { getFormation, POS, POSITIONS } from '@napl/contracts/league';
export { ALL_POSITIONS, DEFAULT_FORMATION, FORMATIONS, FORMATION_IDS, getFormation, POS, POS_LABELS, POSITIONS, SLOT, VOTE_FIELDS, VOTE_POSITIONS } from '@napl/contracts/league';
export type { Formation, FormationId, FormationSlot, Position, SlotId, VoteKey, VotePosition } from '@napl/contracts/league';

export const isSuperAdmin = (account: Account | null | undefined) => account?.roles?.includes('super_admin') ?? false;

export const isAdmin = (account: Account | null | undefined) => isSuperAdmin(account) || (account?.roles?.includes('admin') ?? false);

// ============ COUNTRIES ============
// Players pick a country at registration; the flag shows on their card.
// COUNTRY_CODES maps the country name to its ISO code, used to load a real
// flag image from flagcdn.com (e.g. https://flagcdn.com/w80/ca.png).
export const COUNTRIES = [
  'Canada', 'United States', 'Mexico', 'El Salvador', 'United Kingdom', 'Ireland', 'France',
  'Germany', 'Spain', 'Portugal', 'Italy', 'Netherlands', 'Belgium',
  'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Poland', 'Albania', 'Bosnia and Herzegovina',
  'Brazil', 'Argentina', 'Colombia', 'Chile', 'Australia', 'New Zealand', 'Japan',
  'South Korea', 'China', 'Russia', 'Nigeria', 'South Africa', 'India', 'Other',
];

export const COUNTRY_CODES: Record<string,string> = {
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
export const flagUrl = (country: string | null | undefined) => {
  if (!country) return null;
  const code = COUNTRY_CODES[country];
  return code ? `https://flagcdn.com/w80/${code}.png` : null;
};

// ============ STAT CALCS ============

// ============ FONT/STYLE CSS ============


// ============ PLAYER CARD (FIFA STYLE) ============
// ============ CAPTAIN STAR ============
// Small helper: returns true if the given account is the captain (owner) of
// the given APPROVED team. Used by PlayerCard, roster views, standings, etc.
export const isTeamCaptain = (account: Account | null | undefined, team: Team | null | undefined) =>
  !!(account && team && team.status === 'approved' &&
    team.ownerUsername && account.username &&
    team.ownerUsername.toLowerCase() === account.username.toLowerCase());

// ============ SCHEDULE: ROUND-ROBIN GENERATOR ============
// Classic "circle method" algorithm. For N teams:
//   - If N is odd, add a ghost team so one team gets a bye each round.
//   - Fix team 0, rotate the rest. Each round produces N/2 matches.
//   - For rounds>1, repeat the pattern, swapping home/away on even repeats
//     so the two halves of the season are the "mirror" of each other.
// Returns an array of weeks, each week is an array of {homeTeamId, awayTeamId}.
export const generateRoundRobinSchedule = (teamIds: string[], roundsCount: number = 2) => {
  if (!teamIds || teamIds.length < 2 || (roundsCount < 1)) return [];
  // Shuffle for variety across generations with the same team list.
  const teams: (string|null)[] = [...teamIds];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temporary = teams[i];
    teams[i] = teams[j];
    teams[j] = temporary;
  }
  const hasBye = teams.length % 2 === 1;
  if (hasBye) teams.push(null); // ghost team; one real team sits out each week
  const n = teams.length;
  const halfSize = n / 2;

  // Build one single round-robin via the circle method
  const singleRoundRobin: {homeTeamId:string;awayTeamId:string}[][] = [];
  const working = [...teams];
  for (let round = 0; round < n - 1; round++) {
    const weekMatches = [];
    for (let i = 0; i < halfSize; i++) {
      const home = working[i];
      const away = working[n - 1 - i];
      if (home !== null && away !== null) {
        weekMatches.push({ homeTeamId: home, awayTeamId: away });
      }
    }
    singleRoundRobin.push(weekMatches);
    working.splice(1, 0, working.pop()!);
  }

  // Repeat for the requested number of rounds. Each round swaps home/away
  // from the previous round so teams get balanced home-vs-away games.
  const allWeeks = [];
  for (let r = 0; r < roundsCount; r++) {
    if (r % 2 === 0) {
      allWeeks.push(...singleRoundRobin);
    } else {
      allWeeks.push(...singleRoundRobin.map(wk => wk.map(m => ({
        homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId
      }))));
    }
  }
  return allWeeks;
};

// ============ TEAM ROSTER FORMATION ============
// Displays team members arranged in a 1-3-2-2 formation (8v8) with empty slots
// for missing positions. Extra players (beyond 8) appear under a BENCH section.
// FLEX players go on the bench too since they don't map to a formation slot.
// Clicking any player card opens the PlayerCardModal for full front + back view.
// Pure function: given a team's formation + saved lineup + roster members,
// resolve each slot to a player (or null if unfilled). If no saved lineup
// exists for the current formation, auto-assigns by matching player positions
// to the slot's primary position, strongest OVR first.
export const resolveLineup = (team: Pick<Team, 'formation' | 'lineup'>, members: Account[]) => {
  const formation = getFormation(team.formation);
  const slotIds = formation.slots.map(s => s.id);
  const byUsername = (username: string | undefined) => {
    return username ? members.find(player => player.username.toLowerCase() === username.toLowerCase()) ?? null : null;
  };
  const saved = team.lineup || {};
  const hasSaved = slotIds.some(k => saved[k]);
  if (hasSaved) {
    // Use the captain's saved lineup directly for this formation's slot ids
    const resolved: Record<string,Account|null> = {};
    for (const k of slotIds) resolved[k] = byUsername(saved[k]) || null;
    return resolved;
  }
  // Auto-assign fallback: bucket by player position, pick strongest for each slot
  const buckets: Record<string,Account[]> = Object.fromEntries(POSITIONS.map(position => [position, []]));
  for (const p of members) {
    const pos = p.position || POS.CM;
    const bucket = buckets[pos] ?? buckets[POS.CM]!;
    bucket.push(p);
  }
  const ovrOf = (p: Account) => p.ranking?.score || 0;
  // Local buckets are mutated intentionally; toSorted requires a newer browser baseline.
   
  for (const bucket of Object.values(buckets)) bucket.sort((a, b) => ovrOf(b) - ovrOf(a));
  // Walk the formation's slots in order and pop the strongest matching player
  const resolved: Record<string,Account|null> = {};
  // Track used usernames so a player isn't placed in multiple slots
  const used = new Set<string>();
  for (const slot of formation.slots) {
    const bucket = buckets[slot.pos] || [];
    const next = bucket.find(p => !used.has(p.username.toLowerCase())) || null;
    if (next) used.add(next.username.toLowerCase());
    resolved[slot.id] = next;
  }
  return resolved;
};
