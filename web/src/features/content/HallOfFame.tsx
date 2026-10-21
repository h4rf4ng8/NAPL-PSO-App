import { mergeSeasonPages } from '../dashboard/season-pages';
import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { HallOfFameDocument, DecoratedPlayersDocument, SeasonsDocument, SeasonChampionsDocument } from '../../api/generated/graphql';
import { z } from 'zod';
import type { TeamSummary } from '../teams/models';
import type { PlayerSelection } from '../accounts/StatsView';
import { AWARD_TYPES, AWARD_BY_ID, AwardIcon, ChampionTrophy } from '../../components/Icons';
import { PageButtons } from '../../components/PageButtons';

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
  const { data: seasons, fetchMore: moreSeasons, refetch: refreshSeasons } = useQuery(SeasonsDocument, { variables: { after: null } });
  const [decoratedAfter, setDecoratedAfter] = useState<string | null>(null);
  const [decoratedPrevious, setDecoratedPrevious] = useState<(string | null)[]>([]);
  const decorated = useQuery(DecoratedPlayersDocument, { variables: { after: decoratedAfter } });
  const [championAfter, setChampionAfter] = useState<string | null>(null);
  const [championPrevious, setChampionPrevious] = useState<(string | null)[]>([]);
  const champions = useQuery(SeasonChampionsDocument, { variables: { after: championAfter } });
  const reset = () => { setAfter(null); setPrevious([]); };
  return <div className="space-y-6">
    <h3 className="font-display text-3xl">HALL OF FAME</h3>
    <section><h4 className="font-display text-xl">SEASON CHAMPIONS</h4>
      {champions.loading && <p role="status">Loading champions…</p>}
      {champions.error && <p role="alert">{champions.error.message} <button onClick={() => { setChampionAfter(null); setChampionPrevious([]); void champions.refetch({ after: null }).catch(() => {}); }}>Restart champions</button></p>}
      {champions.data?.seasonChampions.nodes.map((entry, index) => {
        const info = championSchema.parse(entry);
        return <div key={index} className="border rounded p-3"><h5>{info.season}</h5>
          <ChampionTrophy size={24} tone="gold" /> Champion: {info.winnerTeam?.name ?? '—'}<br />
          <ChampionTrophy size={24} tone="silver" /> Runner-up: {info.runnerUpTeam?.name ?? '—'}
        </div>;
      })}
      <PageButtons loading={champions.loading} canPrevious={championPrevious.length > 0} hasNextPage={champions.data?.seasonChampions.pageInfo.hasNextPage ?? false}
        previous={() => { setChampionAfter(championPrevious.at(-1) ?? null); setChampionPrevious(championPrevious.slice(0, -1)); }}
        next={() => { setChampionPrevious([...championPrevious, championAfter]); setChampionAfter(champions.data?.seasonChampions.pageInfo.endCursor ?? null); }} />
    </section>
    <section><h4 className="font-display text-xl">MOST DECORATED</h4>
      {decorated.loading && <p role="status">Loading decorated players…</p>}
      {decorated.error && <p role="alert">{decorated.error.message}<button onClick={() => { setDecoratedAfter(null); setDecoratedPrevious([]); void decorated.refetch({ after: null }).catch(() => {}); }}>Restart decorated players</button></p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{decorated.data?.decoratedPlayers.nodes.map(row => {
        const record = decoratedSchema.parse(row);
        return <button key={record.player.id} onClick={() => onPlayerClick?.({ id: record.player.id })} className="border rounded p-3">{record.player.username} · {record.count} awards</button>;
      })}</div>
      <div className="flex gap-3"><button disabled={decorated.loading || decoratedPrevious.length === 0} onClick={() => { setDecoratedAfter(decoratedPrevious.at(-1) ?? null); setDecoratedPrevious(decoratedPrevious.slice(0, -1)); }}>Previous decorated players</button>
        <button disabled={decorated.loading || !decorated.data?.decoratedPlayers.pageInfo.hasNextPage} onClick={() => { setDecoratedPrevious([...decoratedPrevious, decoratedAfter]); setDecoratedAfter(decorated.data?.decoratedPlayers.pageInfo.endCursor ?? null); }}>Next decorated players</button></div>
    </section>
    <section><h4 className="font-display text-xl">WINNERS BY SEASON</h4>
      <div className="flex gap-3"><select aria-label="Award season" value={season ?? ''} onChange={event => { setSeason(event.target.value || null); reset(); }}><option value="">All seasons</option>{seasons?.seasons.nodes.map(value => <option key={value}>{value}</option>)}</select>
        <select aria-label="Award type" value={awardId ?? ''} onChange={event => { setAwardId(event.target.value || null); reset(); }}><option value="">All awards</option>{AWARD_TYPES.map(award => <option key={award.id} value={award.id}>{award.name}</option>)}</select>
{seasonPageError && <p role="alert">{seasonPageError}<button onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</button></p>}
        {seasons?.seasons.pageInfo.hasNextPage && <button onClick={() => { void moreSeasons({ variables: { after: seasons.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</button>}
      </div>
      {loading && <p role="status">Loading award winners…</p>}
      {error && <p role="alert">{error.message} <button onClick={() => { reset(); void refetch({ after: null }).catch(() => {}); }}>Restart winners</button></p>}
      {data?.hallOfFame.nodes.map((row, index) => {
        const winner = winnerSchema.parse(row);
        return <div key={`${winner.player.id}-${index}`} className="border rounded p-3">
          <AwardIcon awardId={winner.award.awardId} size={24} /> {AWARD_BY_ID[winner.award.awardId]?.name ?? winner.award.awardId} · {winner.award.season}
          <button onClick={() => onPlayerClick?.({ id: winner.player.id, season: winner.award.season })} className="ml-3">{winner.player.username} · {winner.player.position}</button>
          {winner.award.previewTruncated && <p>Preview shortened; open the complete trophy history on this player’s card.</p>}
        </div>;
      })}
      {data?.hallOfFame.totalCount === 0 && <p>No individual award winners yet.</p>}
      <div className="flex gap-3"><button disabled={loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous winners</button>
        <button disabled={loading || !data?.hallOfFame.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.hallOfFame.pageInfo.endCursor ?? null); }}>Next winners</button></div>
    </section>
  </div>;
}
