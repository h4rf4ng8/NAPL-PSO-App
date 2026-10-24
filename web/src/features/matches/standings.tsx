import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { mergeSeasonPages } from '../dashboard/season-pages';
import { z } from 'zod';
import { useQuery } from '@apollo/client/react';
import { TeamStandingsDocument, SeasonsDocument } from '../../api/generated/graphql';
import { MediaImage, mediaUrl } from '../../components/MediaImage';
import { Trophy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../components/ui/table';


// Rankings and tie-breaks come from the API; this schema only validates display data.
const standingsRowSchema = z.object({
  rank: z.number(), team: z.object({ id: z.string(), name: z.string(), tag: z.string(), color: z.string().nullable(), logoUrl: z.string().nullable() }),
  played: z.number(), w: z.number(), d: z.number(), l: z.number(), gf: z.number(), ga: z.number(), gd: z.number(), pts: z.number(),
});
export const TeamStandings = () => {
  const [seasonPageError, setSeasonPageError] = useState('');
  const [season, setSeason] = useState('all');
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const { data: seasonData, fetchMore: moreSeasons, refetch: refreshSeasons } = useQuery(SeasonsDocument, { variables: { after: null } });
  const seasons = seasonData?.seasons.nodes ?? [];
  const { data, loading: recordsLoading, error: recordsError, refetch } = useQuery(TeamStandingsDocument, { variables: { season, after } });
  const standings = (data?.standings.nodes ?? []).map(row => standingsRowSchema.parse(row));
  const hasAnyMatches = standings.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="size-5" aria-hidden="true" /> Standings</h2><Select value={season} onValueChange={value => { setSeason(value); setAfter(null); setPrevious([]); }}><SelectTrigger className="w-44" aria-label="Standings season"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All seasons</SelectItem>{seasons.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
      {recordsError && <Alert variant="destructive"><AlertDescription>{recordsError.message} <Button variant="outline" onClick={() => { setAfter(null); setPrevious([]); void refetch({ after: null }).catch(() => {}); }}>Try again</Button></AlertDescription></Alert>}
      {recordsLoading ? <p role="status" className="text-sm text-muted-foreground">Loading standings…</p> : (hasAnyMatches ? <Card className="overflow-hidden"><Table><caption className="sr-only">League standings for {season === 'all' ? 'all seasons' : season}. Scroll horizontally to view all statistics.</caption><TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Team</TableHead>{['Played', 'Wins', 'Draws', 'Losses', 'GF', 'GA', 'GD', 'Points'].map(label => <TableHead className="text-right" key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{standings.map(row => <TableRow key={row.team.id}><TableCell className="tabular-nums">{row.rank}</TableCell><TableCell><div className="flex min-w-48 items-center gap-2">{row.team.logoUrl && <MediaImage src={mediaUrl(row.team.logoUrl)} alt="" className="size-7 shrink-0 object-contain" />}<span className="font-medium">{row.team.name}</span><Badge variant="outline">{row.team.tag}</Badge></div></TableCell>{[row.played, row.w, row.d, row.l, row.gf, row.ga].map((value, index) => <TableCell key={index} className="text-right tabular-nums">{value}</TableCell>)}<TableCell className="text-right tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</TableCell><TableCell className="text-right font-semibold tabular-nums">{row.pts}</TableCell></TableRow>)}</TableBody></Table></Card> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No imported match results yet.</CardContent></Card>)}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={recordsLoading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous teams</Button>
      <Button variant="outline" disabled={recordsLoading || !data?.standings.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.standings.pageInfo.endCursor ?? null); }}>Next teams</Button>
{seasonPageError && <p role="alert">{seasonPageError}<Button onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</Button></p>}
      {seasonData?.seasons.pageInfo.hasNextPage && <Button onClick={() => { void moreSeasons({ variables: { after: seasonData.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</Button>}</div>
    </div>
  );
};

export const StandingsView = () => <div className="space-y-5"><div><h1 className="text-2xl font-semibold">League standings</h1><p className="mt-1 text-sm text-muted-foreground">Official team rankings from imported match results.</p></div><TeamStandings /></div>;
