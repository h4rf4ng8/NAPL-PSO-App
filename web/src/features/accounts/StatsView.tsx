import { mergeSeasonPages } from '../dashboard/season-pages';
import { mergeLeaderboardPages } from './leaderboard-pages';
import { BarChart3 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  const { data: seasonData, fetchMore: moreSeasons, refetch: refreshSeasons } = useQuery(SeasonsDocument, { variables: { after: null } });
  const seasons = seasonData?.seasons.nodes ?? [];
  // Request the server's max page size (50) and then auto-fetch any
  // remaining pages. We used to show manual Previous/Next buttons, but the
  // byte-size cap in page() would sometimes shrink a page down to 6 rows,
  // which made the stats tab feel broken. Auto-pagination is a cleaner
  // experience even if it costs a few extra round trips when the league
  // grows past 50 players.
  // network-only: each STATS tab mount awaits a fresh fetch rather than
  // serving stale cached data. Needed so stats update when another session
  // changes server state and the user revisits the tab. cache-first keeps
  // stale data; cache-and-network returns cache first and the fresh value
  // arrives too late for test-level assertions and quick revisits.
  const { data, loading, error, fetchMore, refetch } = useQuery(LeaderboardDocument, { fetchPolicy: 'network-only', variables: {
    season: seasonFilter, position: posFilter === 'ALL' ? null : posFilter,
    sortBy, sortDir, first: 50, after: null,
  } });
  // Keep calling fetchMore while there's another page. Apollo's updateQuery
  // concatenates nodes into the cached first-page result, so `data.leaderboard.nodes`
  // grows until it holds every row. Changing any filter (season, position,
  // sortBy, sortDir) refetches the first page and this effect restarts.
  useEffect(() => {
    if (!data?.leaderboard?.pageInfo?.hasNextPage || !data.leaderboard.pageInfo.endCursor) return;
    void fetchMore({
      variables: { after: data.leaderboard.pageInfo.endCursor },
      updateQuery: (before, { fetchMoreResult }) => ({ leaderboard: mergeLeaderboardPages(before.leaderboard, fetchMoreResult.leaderboard) }),
    }).catch((loadError: unknown) => { console.error('leaderboard fetchMore failed:', loadError); });
  }, [data?.leaderboard?.pageInfo?.endCursor, data?.leaderboard?.pageInfo?.hasNextPage, fetchMore]);
  const sorted = useMemo(() => (data?.leaderboard?.nodes ?? []).map(player => {
    const s = accountStatsSchema.parse(player.stats);
    // Normalize identity fields up front so render code doesn't have to
    // defensively optional-chain through Apollo's masked types. Any missing
    // field becomes an empty string / zero rather than undefined.
    const id = player.id ?? '';
    const username = player.username ?? '';
    const position = player.position ?? '';
    return { player, id, username, position,
      team: player.team ?? allTeams.find(team => team.id === player.teamId),
      ovr: player.ranking?.score ?? 0, gp: s.games, g: s.goals, a: s.assists,
      pts: s.goals + s.assists, motm: s.motm, tkl: s.tackles, pass: s.passes,
      cs: s.cleanSheets, dfl: s.deflects, catches: s.catches, w: s.wins, d: s.draws, l: s.losses };
  }), [data, allTeams]);

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
              onClick={() => { setSeasonFilter('all'); }}
              className="px-3 py-1 font-mono text-xs tracking-widest rounded transition-colors"
              style={seasonFilter === 'all'
                ? { background: C.goldLight, color: C.brandNavyDeep }
                : { color: `${C.cream}99` }
              }
            >ALL TIME</button>
            {seasons.map(s => (
              <button
                key={s}
                onClick={() => { setSeasonFilter(s); }}
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
                onClick={() => { setPosFilter(p); }}
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
      {error && <p role="alert">{error.message} <button onClick={() => { void refetch().catch(() => {}); }}>Retry</button></p>}
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
                key={row.username}
                onClick={() => onPlayerClick?.({ id: row.id, season: seasonFilter })}
                className="cursor-pointer transition-colors hover:opacity-90"
                style={{
                  background: i % 2 === 0 ? `${C.navyDeep}44` : 'transparent',
                  borderBottom: `1px solid ${C.navyLight}22`,
                }}
              >
                <td className="px-2 py-2 text-center font-mono text-sm" style={{ color: `${C.cream}66` }}>{i + 1}</td>
                <td className="px-3 py-2 font-heading tracking-wider text-sm" style={{ color: C.cream }}>
                  <div className="flex items-center gap-1.5">
                    {(row.team?.ownerUsername ?? '').toLowerCase() === row.username.toLowerCase() && <CaptainStar size={11} />}
                    {row.username}
                  </div>
                </td>
                <td className="px-2 py-2 font-mono text-xs" style={{ color: row.team ? (row.team.color || C.greenLight) : `${C.cream}44` }}>
                  {row.team?.tag || 'FA'}
                </td>
                <td className="px-2 py-2 text-center font-mono text-xs" style={{ color: `${C.cream}99` }}>{row.position}</td>
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
      {data?.leaderboard?.pageInfo?.hasNextPage && (
        <p className="font-mono text-[10px] mt-3 tracking-wider" style={{ color: `${C.cream}66` }}>
          Loading more players…
        </p>
      )}
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
