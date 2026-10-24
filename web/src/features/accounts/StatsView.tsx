import { mergeSeasonPages } from '../dashboard/season-pages';
import { BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { LeaderboardDocument, SeasonsDocument } from '../../api/generated/graphql';
import { accountStatsSchema } from '@napl/contracts/accounts';

export interface PlayerSelection { id: string; season?: string; }
import type { TeamSummary as Team } from '../teams/models';
import { CaptainStar } from '../../components/Icons';

import { C } from '../../theme/theme';
import { numericRowValue } from '../../utils/input';
import { POSITIONS, POS } from '@napl/contracts/league';
// Stats View
export const StatsView = ({ allTeams = [], onPlayerClick }: { allTeams?: Team[]; onPlayerClick?: (account:PlayerSelection) => void }) => {
  // Default sort: OVR descending (same as the old leaderboard default)
  const [sortBy, setSortBy] = useState('ovr');
  const [sortDir, setSortDir] = useState('desc');
  const [posFilter, setPosFilter] = useState('ALL');
  // Season filter — defaults to ALL TIME. 'all' aggregates every match ever;
  // individual seasons (like 'S1') aggregate only that season's matches.
  const [seasonFilter, setSeasonFilter] = useState('all');

  const [seasonPageError, setSeasonPageError] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<{ cursor: string | null; offset: number }[]>([]);
  const [offset, setOffset] = useState(0);
  const { data: seasonData, fetchMore: moreSeasons, refetch: refreshSeasons } = useQuery(SeasonsDocument, { variables: { after: null } });
  const seasons = seasonData?.seasons.nodes ?? [];
  const { data, loading, error, refetch } = useQuery(LeaderboardDocument, { fetchPolicy: 'cache-and-network', variables: {
    season: seasonFilter, position: posFilter === 'ALL' ? null : posFilter,
    sortBy, sortDir, after,
  } });
  const sorted = useMemo(() => (data?.leaderboard.nodes ?? []).map(player => {
    const s = accountStatsSchema.parse(player.stats);
    return { player, team: player.team ?? allTeams.find(team => team.id === player.teamId),
      ovr: player.ranking.score, gp: s.games, g: s.goals, a: s.assists,
      pts: s.goals + s.assists, motm: s.motm, tkl: s.tackles, pass: s.passes,
      cs: s.cleanSheets, dfl: s.deflects, catches: s.catches, w: s.wins, d: s.draws, l: s.losses };
  }), [data, allTeams]);
  const resetPage = () => { setAfter(null); setPrevious([]); setOffset(0); };

  const toggleSort = (col: string) => {
    resetPage();
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
              onClick={() => { setSeasonFilter('all'); resetPage(); }}
              className="px-3 py-1 font-mono text-xs tracking-widest rounded transition-colors"
              style={seasonFilter === 'all'
                ? { background: C.goldLight, color: C.brandNavyDeep }
                : { color: `${C.cream}99` }
              }
            >ALL TIME</button>
            {seasons.map(s => (
              <button
                key={s}
                onClick={() => { setSeasonFilter(s); resetPage(); }}
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
                onClick={() => { setPosFilter(p); resetPage(); }}
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

      {loading && <p role="status">Loading players…</p>}
      {error && <p role="alert">{error.message} <button onClick={() => { resetPage(); void refetch({ after: null }).catch(() => {}); }}>Retry</button></p>}
{seasonPageError && <p role="alert">{seasonPageError}<button onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</button></p>}
      {seasonData?.seasons.pageInfo.hasNextPage && <button onClick={() => { void moreSeasons({ variables: { after: seasonData.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</button>}
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
                onClick={() => onPlayerClick?.({ id: row.player.id, season: seasonFilter })}
                className="cursor-pointer transition-colors hover:opacity-90"
                style={{
                  background: i % 2 === 0 ? `${C.navyDeep}44` : 'transparent',
                  borderBottom: `1px solid ${C.navyLight}22`,
                }}
              >
                <td className="px-2 py-2 text-center font-mono text-sm" style={{ color: `${C.cream}66` }}>{offset + i + 1}</td>
                <td className="px-3 py-2 font-heading tracking-wider text-sm" style={{ color: C.cream }}>
                  <div className="flex items-center gap-1.5">
                    {row.team && row.team.ownerUsername.toLowerCase() === row.player.username.toLowerCase() && <CaptainStar size={11} />}
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
      <div className="flex gap-3 mt-3">
        <button disabled={loading || previous.length === 0} onClick={() => { const prior = previous.at(-1); setAfter(prior?.cursor ?? null); setOffset(prior?.offset ?? 0); setPrevious(previous.slice(0, -1)); }}>Previous players</button>
        <button disabled={loading || !data?.leaderboard.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, { cursor: after, offset }]); setOffset(offset + sorted.length); setAfter(data?.leaderboard.pageInfo.endCursor ?? null); }}>Next players</button>
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
