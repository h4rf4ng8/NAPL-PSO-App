import { mergeSeasonPages } from '../dashboard/season-pages';
import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { HallOfFameDocument, DecoratedPlayersDocument, SeasonsDocument, SeasonChampionsDocument } from '../../api/generated/graphql';
import { z } from 'zod';
import type { TeamSummary } from '../teams/models';
import type { PlayerSelection } from '../accounts/StatsView';
import { AWARD_TYPES, AWARD_BY_ID, AwardIcon, ChampionTrophy } from '../../components/Icons';
import { PageButtons } from '../../components/PageButtons';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';


const playerSchema = z.object({ id: z.string(), username: z.string(), position: z.string() });
const winnerSchema = z.object({ player: playerSchema, award: z.object({ awardId: z.string(), season: z.string(), detailUrl: z.string().optional(), previewTruncated: z.boolean().optional() }) });
const decoratedSchema = z.object({ player: playerSchema, count: z.number() });
const championSchema = z.object({ season: z.string(), winnerTeam: z.object({ id: z.string(), name: z.string() }).nullable(), runnerUpTeam: z.object({ id: z.string(), name: z.string() }).nullable() });

export function HallOfFameView({ onPlayerClick }: { allTeams?: TeamSummary[]; onPlayerClick?: (player: PlayerSelection) => void }) {
  const [seasonPageError, setSeasonPageError] = useState('');
  const [season, setSeason] = useState<string | null>(null);
  const [awardId, setAwardId] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const { data, loading, error, refetch } = useQuery(HallOfFameDocument, { variables: { season, awardId, after } });
  const { data: seasons, loading: seasonsLoading, error: seasonsError, fetchMore: moreSeasons, refetch: refreshSeasons } = useQuery(SeasonsDocument, { variables: { after: null } });
  const [decoratedAfter, setDecoratedAfter] = useState<string | null>(null);
  const [decoratedPrevious, setDecoratedPrevious] = useState<(string | null)[]>([]);
  const decorated = useQuery(DecoratedPlayersDocument, { variables: { after: decoratedAfter } });
  const [championAfter, setChampionAfter] = useState<string | null>(null);
  const [championPrevious, setChampionPrevious] = useState<(string | null)[]>([]);
  const champions = useQuery(SeasonChampionsDocument, { variables: { after: championAfter } });
  const reset = () => { setAfter(null); setPrevious([]); };
  return <div className="space-y-6">
    <section aria-labelledby="champions-heading" className="space-y-4"><h2 id="champions-heading" className="text-xl font-semibold">Season champions</h2>
      {champions.loading && <div role="status"><span className="sr-only">Loading champions…</span><Skeleton className="h-28" /></div>}
      {champions.error && <Alert variant="destructive"><AlertDescription>{champions.error.message} <Button variant="outline" onClick={() => { setChampionAfter(null); setChampionPrevious([]); void champions.refetch({ after: null }).catch(() => {}); }}>Restart champions</Button></AlertDescription></Alert>}
      <div className="grid gap-4 md:grid-cols-2">{champions.data?.seasonChampions.nodes.map((entry, index) => {
        const info = championSchema.parse(entry);
        return <Card key={`${info.season}-${index}`}><CardHeader><CardTitle className="text-lg">{info.season}</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-3"><ChampionTrophy size={32} tone="gold" /><div className="min-w-0"><p className="text-sm text-muted-foreground">Champion</p><p className="break-words font-semibold">{info.winnerTeam?.name ?? 'Not assigned'}</p></div></div><div className="flex items-center gap-3"><ChampionTrophy size={32} tone="silver" /><div className="min-w-0"><p className="text-sm text-muted-foreground">Runner-up</p><p className="break-words">{info.runnerUpTeam?.name ?? 'Not assigned'}</p></div></div></CardContent></Card>;
      })}</div>
      {champions.data?.seasonChampions.totalCount === 0 && <p className="text-muted-foreground">No championships have been recorded.</p>}
      <PageButtons loading={champions.loading} canPrevious={championPrevious.length > 0} hasNextPage={champions.data?.seasonChampions.pageInfo.hasNextPage ?? false}
        previous={() => { setChampionAfter(championPrevious.at(-1) ?? null); setChampionPrevious(championPrevious.slice(0, -1)); }}
        next={() => { setChampionPrevious([...championPrevious, championAfter]); setChampionAfter(champions.data?.seasonChampions.pageInfo.endCursor ?? null); }} />
    </section>
    <section aria-labelledby="decorated-heading" className="space-y-4"><h2 id="decorated-heading" className="text-xl font-semibold">Most decorated players</h2>
      {decorated.loading && <div role="status"><span className="sr-only">Loading decorated players…</span><Skeleton className="h-24" /></div>}
      {decorated.error && <Alert variant="destructive"><AlertDescription>{decorated.error.message} <Button variant="outline" onClick={() => { setDecoratedAfter(null); setDecoratedPrevious([]); void decorated.refetch({ after: null }).catch(() => {}); }}>Restart decorated players</Button></AlertDescription></Alert>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{decorated.data?.decoratedPlayers.nodes.map(row => {
        const record = decoratedSchema.parse(row);
        return <Card key={record.player.id}><CardContent className="flex flex-wrap items-center gap-2 p-4"><Button variant="link" className="h-auto min-w-0 justify-start whitespace-normal break-words px-0 text-left" onClick={() => onPlayerClick?.({ id: record.player.id })}>{record.player.username}</Button><Badge variant="secondary">{record.count} awards</Badge></CardContent></Card>;
      })}</div>
      {decorated.data?.decoratedPlayers.totalCount === 0 && <p className="text-muted-foreground">No decorated players yet.</p>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={decorated.loading || decoratedPrevious.length === 0} onClick={() => { setDecoratedAfter(decoratedPrevious.at(-1) ?? null); setDecoratedPrevious(decoratedPrevious.slice(0, -1)); }}>Previous decorated players</Button><Button variant="outline" disabled={decorated.loading || !decorated.data?.decoratedPlayers.pageInfo.hasNextPage} onClick={() => { setDecoratedPrevious([...decoratedPrevious, decoratedAfter]); setDecoratedAfter(decorated.data?.decoratedPlayers.pageInfo.endCursor ?? null); }}>Next decorated players</Button></div>
    </section>
    <section aria-labelledby="winners-heading" className="space-y-4"><h2 id="winners-heading" className="text-xl font-semibold">Winners by season</h2>
      <div className="flex flex-wrap gap-3"><Select value={season ?? 'all'} onValueChange={value => { setSeason(value === 'all' ? null : value); reset(); }}><SelectTrigger aria-label="Award season" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All seasons</SelectItem>{seasons?.seasons.nodes.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
        <Select value={awardId ?? 'all'} onValueChange={value => { setAwardId(value === 'all' ? null : value); reset(); }}><SelectTrigger aria-label="Award type" className="w-full sm:w-60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All awards</SelectItem>{AWARD_TYPES.map(award => <SelectItem key={award.id} value={award.id}>{award.name}</SelectItem>)}</SelectContent></Select>
        {seasons?.seasons.pageInfo.hasNextPage && <Button variant="outline" disabled={seasonsLoading} onClick={() => { void moreSeasons({ variables: { after: seasons.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</Button>}
      </div>
      {(seasonPageError || seasonsError) && <Alert variant="destructive"><AlertDescription>{seasonPageError || seasonsError?.message} <Button variant="outline" onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</Button></AlertDescription></Alert>}
      {loading && <div role="status"><span className="sr-only">Loading award winners…</span><Skeleton className="h-24" /></div>}
      {error && <Alert variant="destructive"><AlertDescription>{error.message} <Button variant="outline" onClick={() => { reset(); void refetch({ after: null }).catch(() => {}); }}>Restart winners</Button></AlertDescription></Alert>}
      <div className="grid gap-3 md:grid-cols-2">{data?.hallOfFame.nodes.map((row, index) => {
        const winner = winnerSchema.parse(row);
        return <Card key={`${winner.player.id}-${index}`}><CardContent className="space-y-2 p-4"><div className="flex items-center gap-3"><AwardIcon awardId={winner.award.awardId} size={32} /><div className="min-w-0"><p className="break-words font-medium">{AWARD_BY_ID[winner.award.awardId]?.name ?? winner.award.awardId}</p><p className="text-sm text-muted-foreground">{winner.award.season}</p></div></div><Button variant="link" className="h-auto max-w-full whitespace-normal break-words px-0 text-left" onClick={() => onPlayerClick?.({ id: winner.player.id, season: winner.award.season })}>{winner.player.username} · {winner.player.position}</Button>{winner.award.previewTruncated && <p className="text-sm text-muted-foreground">Open this player’s card for the complete trophy history.</p>}</CardContent></Card>;
      })}</div>
      {data?.hallOfFame.totalCount === 0 && <p className="text-muted-foreground">No individual award winners yet.</p>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous winners</Button><Button variant="outline" disabled={loading || !data?.hallOfFame.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.hallOfFame.pageInfo.endCursor ?? null); }}>Next winners</Button></div>
    </section>
  </div>;
}
