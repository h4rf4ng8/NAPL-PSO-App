import { BarChart3 } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import type { Account, Rankings } from './models';
import type { Team } from '../teams/models';
import { CaptainStar } from '../../components/Icons';

import { C } from '../../theme/theme';
import { numericRowValue } from '../../utils/input';
import { isTeamCaptain } from '../../utils/league';
import { getStatsForSeason } from '../../utils/rankings';
import { POSITIONS, POS } from '@napl/contracts/league';
// Stats View
export const StatsView = ({ allPlayers = [], allTeams = [], rankings = new Map(), onPlayerClick }: { allPlayers?: Account[]; allTeams?: Team[]; rankings?: Rankings | null; onPlayerClick?: (account:Account) => void }) => {
  // Default sort: OVR descending (same as the old leaderboard default)
  const [sortBy, setSortBy] = useState('ovr');
  const [sortDir, setSortDir] = useState('desc');
  const [posFilter, setPosFilter] = useState('ALL');
  // Season filter — defaults to ALL TIME. 'all' aggregates every match ever;
  // individual seasons (like 'S1') aggregate only that season's matches.
  const [seasonFilter, setSeasonFilter] = useState('all');

  const teamByUsername = (u: string) => allTeams.find(t => (t.members || []).some(m => m.toLowerCase() === u.toLowerCase()));

  // Build the list of seasons present in any player's match history.
  // Always includes 'all' at the top of the dropdown.
  const seasons = useMemo(() => {
    const set = new Set<string>();
    allPlayers.forEach(p => {
      if (p.seasonStats) Object.keys(p.seasonStats).forEach(s => { if (s !== 'all') set.add(s); });
      else (p.matches || []).forEach(m => set.add(m.season || 'S1'));
    });
    return [...set].sort((a,b)=>b.localeCompare(a));
  }, [allPlayers]);

  // Build rows — one per player, with every stat flattened for sorting.
  // getStatsForSeason() handles the aggregation: 'all' returns the stored
  // all-time totals; a specific season sums only that season's matches.
  const rows = useMemo(() => {
    return allPlayers
      .filter(p => posFilter === 'ALL' || p.position === posFilter)
      .map(p => {
        const s = getStatsForSeason(p, seasonFilter);
        const g = s.goals || 0;
        const a = s.assists || 0;
        // OVR always comes from the player's all-time percentile ranking so
        // the STATS table matches the OVR shown on each player's card.
        // (Per-season "form" OVRs would need their own ranking pool — not
        // worth the complexity for now; the season filter still filters
        // every other stat column, just not the OVR itself.)
        const rankingEntry = rankings?.get ? rankings.get(p.username.toLowerCase()) : null;
        const ovr = rankingEntry?.score || 0;
        return {
          player: p,
          team: teamByUsername(p.username),
          ovr,
          gp: s.games || 0,
          g, a,
          pts: g + a,
          motm: s.motm || 0,
          tkl: s.tackles || 0,
          pass: s.passes || 0,
          cs: s.cleanSheets || 0,
          dfl: s.deflects || 0,
          catches: s.catches || 0,
          w: s.wins || 0,
          d: s.draws || 0,
          l: s.losses || 0,
          _seasonStats: s, // passed through if player card is opened
        };
      });
  }, [allPlayers, allTeams, rankings, posFilter, seasonFilter]);

  const sorted = useMemo(() => {
    const sorted = [...rows].sort((x, y) => {
      const a = numericRowValue(x,sortBy);
      const b = numericRowValue(y,sortBy);
      return sortDir === 'asc' ? a - b : b - a;
    });
    return sorted;
  }, [rows, sortBy, sortDir]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc'); // new column defaults to descending (best first)
    }
  };

  // Columns configuration. "field" is the key on each row; "label" is the header.
  // GK-emphasized columns (DFL, CATCHES, CS) always visible but moved to the
  // front when the GK filter is selected.
  const outfieldCols = [
    { field: 'ovr', label: 'OVR', help: 'Overall rating' },
    { field: 'gp', label: 'GP', help: 'Games played' },
    { field: 'g', label: 'G', help: 'Goals' },
    { field: 'a', label: 'A', help: 'Assists' },
    { field: 'pts', label: 'PTS', help: 'Points (G+A)' },
    { field: 'motm', label: 'MOTM', help: 'Man of the Match awards' },
    { field: 'tkl', label: 'TKL', help: 'Tackles' },
    { field: 'pass', label: 'PASS', help: 'Passes' },
    { field: 'w', label: 'W', help: 'Wins' },
    { field: 'd', label: 'D', help: 'Draws' },
    { field: 'l', label: 'L', help: 'Losses' },
  ];
  const gkCols = [
    { field: 'ovr', label: 'OVR', help: 'Overall rating' },
    { field: 'gp', label: 'GP', help: 'Games played' },
    { field: 'dfl', label: 'DFL', help: 'Deflects (saves)' },
    { field: 'catches', label: 'CTCH', help: 'Catches' },
    { field: 'cs', label: 'CS', help: 'Clean sheets' },
    { field: 'g', label: 'G', help: 'Goals' },
    { field: 'a', label: 'A', help: 'Assists' },
    { field: 'motm', label: 'MOTM', help: 'Man of the Match awards' },
    { field: 'w', label: 'W', help: 'Wins' },
    { field: 'd', label: 'D', help: 'Draws' },
    { field: 'l', label: 'L', help: 'Losses' },
  ];
  const cols = posFilter === POS.GK ? gkCols : outfieldCols;

  const SortArrow = ({ col }: { col: string }) => {
    if (sortBy !== col) {
      return <span className="opacity-30 ml-0.5">↕</span>;
    }
    return <span className="ml-0.5" style={{ color: C.goldLight }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-3">
          <BarChart3 size={22} style={{ color: C.goldLight }} />
          <h3 className="font-display text-3xl tracking-wider">STATS</h3>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Season chips — ALL TIME + each season that has data */}
          <div className="flex gap-1 rounded p-0.5 flex-wrap" style={{ background: `${C.navyLight}33` }}>
            <button
              onClick={() => setSeasonFilter('all')}
              className="px-3 py-1 font-mono text-xs tracking-widest rounded transition-colors"
              style={seasonFilter === 'all'
                ? { background: C.goldLight, color: C.brandNavyDeep }
                : { color: `${C.cream}99` }
              }
            >ALL TIME</button>
            {seasons.map(s => (
              <button
                key={s}
                onClick={() => setSeasonFilter(s)}
                className="px-3 py-1 font-mono text-xs tracking-widest rounded transition-colors"
                style={seasonFilter === s
                  ? { background: C.goldLight, color: C.brandNavyDeep }
                  : { color: `${C.cream}99` }
                }
              >{s}</button>
            ))}
          </div>
          {/* Position filter chips */}
          <div className="flex gap-1 rounded p-0.5" style={{ background: `${C.navyLight}33` }}>
            {['ALL', ...POSITIONS].map(p => (
              <button
                key={p}
                onClick={() => setPosFilter(p)}
                className="px-2.5 py-1 font-mono text-xs tracking-widest rounded transition-colors"
                style={posFilter === p
                  ? { background: C.gold, color: C.brandNavyDeep }
                  : { color: `${C.cream}99` }
                }
              >{p}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="font-mono text-[10px] mb-2 tracking-wider" style={{ color: `${C.cream}66` }}>
        Click any column header to sort. Click again to reverse.
      </div>

      {/* Scrollable table — scrolls horizontally on narrow screens so no column
          gets squished. Sticky player column makes scrolling easier to follow. */}
      <div className="rounded-lg overflow-x-auto" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}33` }}>
        <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: `${C.brandNavyDeep}cc` }}>
              <th className="px-2 py-2 text-center font-mono text-[10px] tracking-widest" style={{ color: `${C.cream}99`, minWidth: 36 }}>#</th>
              <th className="px-3 py-2 text-left font-mono text-[10px] tracking-widest" style={{ color: `${C.cream}99`, minWidth: 160 }}>PLAYER</th>
              <th className="px-2 py-2 text-left font-mono text-[10px] tracking-widest" style={{ color: `${C.cream}99`, minWidth: 70 }}>TEAM</th>
              <th className="px-2 py-2 text-center font-mono text-[10px] tracking-widest" style={{ color: `${C.cream}99`, minWidth: 50 }}>POS</th>
              {cols.map(c => (
                <th
                  key={c.field}
                  onClick={() => toggleSort(c.field)}
                  title={c.help}
                  className="px-2 py-2 text-center font-mono text-[10px] tracking-widest cursor-pointer select-none"
                  style={{
                    color: sortBy === c.field ? C.goldLight : `${C.cream}99`,
                    minWidth: 55,
                    userSelect: 'none',
                  }}
                >{c.label}<SortArrow col={c.field} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row.player.username}
                onClick={() => onPlayerClick?.({ ...row.player, stats: row._seasonStats, _team: row.team })}
                className="cursor-pointer transition-colors hover:opacity-90"
                style={{
                  background: i % 2 === 0 ? `${C.navyDeep}44` : 'transparent',
                  borderBottom: `1px solid ${C.navyLight}22`,
                }}
              >
                <td className="px-2 py-2 text-center font-mono text-sm" style={{ color: `${C.cream}66` }}>{i + 1}</td>
                <td className="px-3 py-2 font-heading tracking-wider text-sm" style={{ color: C.cream }}>
                  <div className="flex items-center gap-1.5">
                    {row.team && isTeamCaptain(row.player, row.team) && <CaptainStar size={11} />}
                    {row.player.username}
                  </div>
                </td>
                <td className="px-2 py-2 font-mono text-xs" style={{ color: row.team ? (row.team.color || C.greenLight) : `${C.cream}44` }}>
                  {row.team?.tag || 'FA'}
                </td>
                <td className="px-2 py-2 text-center font-mono text-xs" style={{ color: `${C.cream}99` }}>{row.player.position}</td>
                {cols.map(c => (
                  <td
                    key={c.field}
                    className="px-2 py-2 text-center font-mono text-sm"
                    style={{
                      color: sortBy === c.field ? C.goldLight : C.cream,
                      fontWeight: sortBy === c.field ? 600 : 400,
                    }}
                  >{numericRowValue(row,c.field)}</td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={cols.length + 4} className="text-center py-8 font-mono text-xs" style={{ color: `${C.cream}66` }}>
                  No players match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Shown once after a Discord user's first sign-in. Forces them to:
//   1. Enter their Strikers Club Player ID (required to join a team)
//   2. Confirm their primary position (default is 'CM' from account creation,
//      but we want them to actively pick one so match-import matching works
//      and their card displays accurately).
// Cannot be dismissed without completing both. Once saved, the strikersId
// lock kicks in just like the MY CARD editor — players can't change it
// themselves after that.
