import { Alert, AlertDescription } from '../../components/ui/alert';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { mergeSeasonPages } from '../dashboard/season-pages';
import { BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { LeaderboardDocument, SeasonsDocument } from '../../api/generated/graphql';
import { accountStatsSchema } from '@napl/contracts/accounts';

export interface PlayerSelection { id: string; season?: string; }
import type { TeamSummary as Team } from '../teams/models';
import { CaptainStar } from '../../components/Icons';


import { numericRowValue } from '../../utils/input';
import { POSITIONS, POS } from '@napl/contracts/league';
import { Button } from '../../components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../components/ui/table';

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

  return <section className="min-w-0 space-y-4">
    <h2 className="flex items-center gap-2 text-2xl font-semibold"><BarChart3 className="size-6 text-primary" />Player statistics</h2>
    <Card className="space-y-4 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-2 sm:w-56">
          <Label htmlFor="stats-season">Season</Label>
          <Select value={seasonFilter} onValueChange={season => { setSeasonFilter(season); resetPage(); }}>
            <SelectTrigger id="stats-season"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All time</SelectItem>{seasons.map(season => <SelectItem key={season} value={season}>{season}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><p className="text-sm font-medium" id="position-filter-label">Position</p><div role="group" aria-labelledby="position-filter-label" className="flex flex-wrap gap-1">
          {['ALL', ...POSITIONS].map(position => <Button key={position} variant={posFilter === position ? 'default' : 'outline'} aria-pressed={posFilter === position} onClick={() => { setPosFilter(position); resetPage(); }}>{position}</Button>)}
        </div></div>
      </div>
      {seasonData?.seasons.pageInfo.hasNextPage && <Button variant="outline" onClick={() => { void moreSeasons({ variables: { after: seasonData.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</Button>}
      {seasonPageError && <Alert variant="destructive"><AlertDescription>{seasonPageError}</AlertDescription><Button className="mt-2" variant="outline" onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</Button></Alert>}
    </Card>
    <p id="stats-sort-help" className="text-xs text-muted-foreground">Select a column heading to sort; select it again to reverse. Scroll horizontally to see every statistic.</p>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading players…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription><Button className="mt-2" variant="outline" onClick={() => { resetPage(); void refetch({ after: null }).catch(() => {}); }}>Retry</Button></Alert>}
    <Card className="min-w-0 overflow-hidden">
      <Table aria-label="Player statistics" aria-describedby="stats-sort-help">
        <TableHeader><TableRow>
          <TableHead className="w-12 text-center">#</TableHead>
          <TableHead className="sticky left-0 z-10 min-w-40 bg-card">Player</TableHead>
          <TableHead>Team</TableHead><TableHead>Position</TableHead>
          {cols.map(column => <TableHead key={column.field} className="p-0 text-center" aria-sort={sortBy === column.field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <Button variant="ghost" className="w-full min-w-16 rounded-none px-2" aria-label={`${column.label}: sort by ${column.help}`} title={column.help} onClick={() => toggleSort(column.field)}>{column.label}<span aria-hidden="true">{sortBy === column.field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span></Button>
          </TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {sorted.map((row, index) => <TableRow key={row.player.id}>
            <TableCell className="text-center tabular-nums text-muted-foreground">{offset + index + 1}</TableCell>
            <TableCell className="sticky left-0 z-10 bg-card p-0">
              <Button variant="ghost" className="w-full justify-start rounded-none px-4 text-left" disabled={!onPlayerClick} onClick={() => onPlayerClick?.({ id: row.player.id, season: seasonFilter })}>
                {row.team && row.team.ownerUsername.toLowerCase() === row.player.username.toLowerCase() && <CaptainStar size={14} />}{row.player.username}
              </Button>
            </TableCell>
            <TableCell><Badge variant="secondary">{row.team?.tag || 'FA'}</Badge></TableCell>
            <TableCell>{row.player.position}</TableCell>
            {cols.map(column => <TableCell key={column.field} className={sortBy === column.field ? 'text-center font-semibold tabular-nums' : 'text-center tabular-nums text-muted-foreground'}>{numericRowValue(row, column.field)}</TableCell>)}
          </TableRow>)}
          {!loading && sorted.length === 0 && <TableRow><TableCell colSpan={cols.length + 4} className="py-10 text-center text-muted-foreground">No players match this filter.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={loading || previous.length === 0} onClick={() => { const prior = previous.at(-1); setAfter(prior?.cursor ?? null); setOffset(prior?.offset ?? 0); setPrevious(previous.slice(0, -1)); }}>Previous players</Button>
      <Button variant="outline" disabled={loading || !data?.leaderboard.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, { cursor: after, offset }]); setOffset(offset + sorted.length); setAfter(data?.leaderboard.pageInfo.endCursor ?? null); }}>Next players</Button>
    </div>
  </section>;
};
