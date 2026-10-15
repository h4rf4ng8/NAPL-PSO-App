import { Trophy } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import { teams as teamApi } from '../teams/api';
import { inStandings } from '../teams/selectors';
import { useResource } from '../../hooks/use-resource';
import { loadTeamRecords } from './api';
import type { TeamRecord } from '@napl/contracts/matches';

import type { Account } from '../accounts/models';
import type { Team } from '../teams/models';
import { C } from '../../theme/theme';

// ============ TEAM STANDINGS ============
// Derives the league table from each player's imported match records:
// dedup by (team_id + strikersMatchId) so a match only counts once per team
// regardless of how many players logged it. Tiebreakers follow Rulebook 2.1.3:
// Points → Wins → Goal Diff → Total Goals → team name alphabetically.
export const TeamStandings = ({ allTeams = [], allPlayers = [], records }: { allTeams?: Team[]; allPlayers?: Account[]; records?: TeamRecord[] }) => {
  const [season, setSeason] = useState('all');
  const [refresh, setRefresh] = useState(0);
  const { data: fetchedRecords = [], loading: recordsLoading, error: recordsError } = useResource(
    () => records ? Promise.resolve(records) : loadTeamRecords(refresh > 0), [records, refresh],
  );
  const teamRecords = records ?? fetchedRecords;

  // Available seasons for the filter dropdown
  const seasons = useMemo(() => {
    const set = new Set<string>();
    teamRecords.forEach(row => { if (row.season !== 'all') set.add(row.season); });
    allPlayers.forEach(p => Object.keys(p.seasonStats || {}).forEach(s => { if (s !== 'all') set.add(s); }));
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, [teamRecords, allPlayers]);

  // Aggregate stats per team. team.seasons is an EXCLUSION list — if the
  // current season is in it, the team is hidden from this view. Empty list
  // means "participates in all seasons" (default).
  const standings = useMemo(() => {
    const approvedTeams = allTeams.filter(t => inStandings(t, season));
    const rows = approvedTeams.map(team => {
      const record = teamRecords.find(item => item.teamId === team.id && item.season === season);
      return { team, played: record?.played || 0, w: record?.w || 0, d: record?.d || 0, l: record?.l || 0,
        gf: record?.gf || 0, ga: record?.ga || 0, gd: record?.gd || 0, pts: record?.pts || 0 };
    });
    // Rulebook 2.1.3.2 tiebreakers: Points → Wins → GD → GF → name
    // (Head-to-head omitted for now — complex, add later if needed)
    return rows.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.w   !== a.w)   return b.w   - a.w;
      if (b.gd  !== a.gd)  return b.gd  - a.gd;
      return b.gf  === a.gf ? a.team.name.localeCompare(b.team.name) : b.gf  - a.gf;
    });
  }, [teamRecords, allTeams, season]);

  const hasAnyMatches = teamRecords.some(row => row.season === season && row.played > 0);

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
            onChange={(e) => setSeason(e.target.value)}
            className="rounded px-2 py-1 font-mono text-[11px] tracking-wider"
            style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66` }}
          >
            <option value="all">ALL SEASONS</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {recordsError && <p role="alert">{recordsError} <button onClick={() => setRefresh(value => value + 1)}>Try again</button></p>}
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
              {standings.map((row, idx) => (
                <tr key={row.team.id} style={{
                  borderBottom: `1px solid ${C.navyLight}22`,
                  background: idx === 0 ? `${C.goldLight}11` : 'transparent',
                }}>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: C.brandNavy }}>{idx + 1}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {row.team.logoUrl && (
                        <img src={row.team.logoUrl} alt="" className="w-5 h-5 rounded shrink-0 object-cover" />
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
    </div>
  );
};

// ============ STANDINGS VIEW (main nav tab) ============
// Full-page wrapper around TeamStandings. Loads teams + players fresh each
// time this view mounts so freshly-imported matches show up right away.
export const StandingsView = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => { try { const t = await teamApi.listTeams(); if (alive) setTeams(t); } catch (error) { if (alive) setLoadError(error instanceof Error ? error.message : 'Could not load standings.'); } finally { if (alive) setLoading(false); } })();
    return () => { alive = false; };
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Trophy size={22} style={{ color: C.brandNavy }} />
        <h1 className="font-display text-2xl tracking-wider" style={{ color: C.brandNavyDeep, letterSpacing: '0.2em' }}>LEAGUE STANDINGS</h1>
      </div>
      {loadError && <p role="alert">{loadError}</p>}
      {loading ? (
        <div className="text-center py-8 font-mono text-sm" style={{ color: `${C.brandNavy}77` }}>Loading standings...</div>
      ) : (
        <TeamStandings allTeams={teams} />
      )}
    </div>
  );
};
