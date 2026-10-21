import { mergeSeasonPages } from '../dashboard/season-pages';
import { z } from 'zod';
import { useQuery } from '@apollo/client/react';
import { TeamStandingsDocument, SeasonsDocument } from '../../api/generated/graphql';
import { MediaImage, mediaUrl } from '../../components/MediaImage';
import { Trophy } from 'lucide-react';
import { useState } from 'react';

import { C } from '../../theme/theme';

// ============ TEAM STANDINGS ============
// Derives the league table from each player's imported match records:
// dedup by (team_id + strikersMatchId) so a match only counts once per team
// regardless of how many players logged it. Tiebreakers follow Rulebook 2.1.3:
// Points → Wins → Goal Diff → Total Goals → team name alphabetically.
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-lg tracking-wider" style={{ color: C.cream }}>STANDINGS</span>
        </div>
        {seasons.length > 0 && (
          <select
            value={season}
            onChange={(e) => { setSeason(e.target.value); setAfter(null); setPrevious([]); }}
            className="rounded px-2 py-1 font-mono text-[11px] tracking-wider"
            style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66` }}
          >
            <option value="all">ALL SEASONS</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {recordsError && <p role="alert">{recordsError.message} <button onClick={() => { setAfter(null); setPrevious([]); void refetch({ after: null }).catch(() => {}); }}>Try again</button></p>}
      {recordsLoading ? <p role="status">Loading standings…</p> : (hasAnyMatches ? (
        <div className="rounded-lg overflow-x-auto" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: `${C.brandNavy}dd` }}>
                <th className="text-left font-mono text-[10px] tracking-[0.15em] px-3 py-2" style={{ color: C.cream }}>#</th>
                <th className="text-left font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>TEAM</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>P</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>W</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>D</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>L</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>GF</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>GA</th>
                <th className="text-center font-mono text-[10px] tracking-[0.15em] px-2 py-2" style={{ color: C.cream }}>GD</th>
                <th className="text-right font-mono text-[10px] tracking-[0.15em] px-3 py-2" style={{ color: C.goldLight }}>PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map(row => (
                <tr key={row.team.id} style={{
                  borderBottom: `1px solid ${C.navyLight}22`,
                  background: row.rank === 1 ? `${C.goldLight}11` : 'transparent',
                }}>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: C.brandNavy }}>{row.rank}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {row.team.logoUrl && (
                        <MediaImage src={mediaUrl(row.team.logoUrl)} alt="" className="w-5 h-5 rounded shrink-0 object-cover" />
                      )}
                      <span className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>{row.team.name}</span>
                      <span className="font-mono text-[9px] px-1 rounded" style={{ background: `${row.team.color || C.navyLight}33`, color: `${C.brandNavy}88` }}>{row.team.tag}</span>
                    </div>
                  </td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.played}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.w}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.d}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.l}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.gf}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: `${C.brandNavy}aa` }}>{row.ga}</td>
                  <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: row.gd > 0 ? C.green : (row.gd < 0 ? C.red : `${C.brandNavy}88`) }}>
                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                  </td>
                  <td className="text-right px-3 py-2 font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-6 font-mono text-xs" style={{ color: `${C.cream}55` }}>
          NO APPROVED MATCHES YET
        </div>
      ))}
      <div className="flex gap-3"><button disabled={recordsLoading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous teams</button>
      <button disabled={recordsLoading || !data?.standings.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.standings.pageInfo.endCursor ?? null); }}>Next teams</button>
{seasonPageError && <p role="alert">{seasonPageError}<button onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</button></p>}
      {seasonData?.seasons.pageInfo.hasNextPage && <button onClick={() => { void moreSeasons({ variables: { after: seasonData.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</button>}</div>
    </div>
  );
};

export const StandingsView = () => <div>
  <h1 className="font-display text-2xl tracking-wider mb-4">LEAGUE STANDINGS</h1>
  <TeamStandings />
</div>;
