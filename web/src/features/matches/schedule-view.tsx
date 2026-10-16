import { Calendar, Plus } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import { teams as teamApi } from '../teams/api';
import { loadTeamRecords, matches as matchApi } from './api';
import { useResource } from '../../hooks/use-resource';

import type { Account } from '../accounts/models';
import type { ScheduledMatch } from './models';
import type { Team } from '../teams/models';
import { C } from '../../theme/theme';
import { isAdmin } from '../../utils/league';
import { AddMatchModal, EditMatchModal, GenerateScheduleModal } from './schedule-setup';

export const ScheduleView = ({ account }: { account: Account | null }) => {
  const { data, loading, error: loadError, reload } = useResource(async () => {
    const [matches, teams, teamRecords] = await Promise.all([
      matchApi.listScheduledMatches(), teamApi.listTeams(), loadTeamRecords(),
    ]);
    return { matches, teams, teamRecords };
  }, []);
  const matches = data?.matches ?? [];
  const teams = data?.teams ?? [];
  const teamRecords = data?.teamRecords ?? [];
  const [season, setSeason] = useState('');
  const [editing, setEditing] = useState<ScheduledMatch | null>(null);
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  // Week slider: null = show all weeks, number = jump to that specific week
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  // Seasons created via SKIP GENERATION don't have any matches yet, so they
  // wouldn't show up in the derived `seasons` list below. Track them here
  // too so the filter dropdown still includes them.
  const [emptySeasons, setEmptySeasons] = useState<string[]>([]);
  const isAdminUser = isAdmin(account);

  // Available seasons for the filter dropdown — matches-derived + any empty
  // seasons admin spun up via SKIP GENERATION
  const seasons = useMemo(() => {
    const set = new Set<string>();
    matches.forEach(m => set.add(m.season));
    teamRecords.forEach(row => { if (row.season !== 'all') set.add(row.season); });
    emptySeasons.forEach(s => set.add(s));
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, [matches, teamRecords, emptySeasons]);

  // Default to the most recent season on first load
  useEffect(() => {
    if (!season && seasons.length > 0) setSeason(seasons.at(-1)!);
  }, [seasons, season]);

  // Reset the week slider whenever the season changes — different seasons
  // have different week ranges, so holding the old week would be confusing.
  useEffect(() => { setSelectedWeek(null); }, [season]);

  const filtered = season ? matches.filter(m => m.season === season) : matches;

  // Team W/D/L records. Derived from imported player matches (same source
  // as STANDINGS) so the two tabs show identical numbers.
  // Logic matches TeamStandings exactly: for each player, walk matches, dedup
  // by (ownTeamId + strikersMatchId) so one match counts once per team, then
  // aggregate W/D/L per team across every season imported.
  const recordsByTeam = useMemo(() => {
    const rec: Record<string,{w:number;d:number;l:number}> = {};
    for (const row of teamRecords) if (row.season === 'all') rec[row.teamId] = { w: row.w, d: row.d, l: row.l };
    return rec;
  }, [teamRecords]);
  const recordStringFor = (teamId: string | null | undefined) => {
    const r = teamId ? recordsByTeam[teamId] : undefined;
    return !r || (r.w + r.d + r.l) === 0 ? null : `${r.w}W-${r.d}D-${r.l}L`;
  };

  // Group by week
  const byWeek = useMemo(() => {
    const groups: Record<number,ScheduledMatch[]> = {};
    filtered.forEach(m => {
      if (!groups[m.week]) groups[m.week] = [];
      groups[m.week].push(m);
    });
    // Sort each week by scheduled date (null dates last)
    Object.values(groups).forEach(wk => wk.sort((a, b) => {
      if (!a.scheduledDate && !b.scheduledDate) return 0;
      if (!a.scheduledDate) return 1;
      return b.scheduledDate ? a.scheduledDate - b.scheduledDate : -1;
    }));
    return groups;
  }, [filtered]);

  const teamById = (id: string | null | undefined) => teams.find(t => t.id === id);
  const fmtDate = (ms: number | null | undefined) => {
    if (!ms) return 'TBD';
    const d = new Date(ms);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      + ' • ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const statusBadge = (m: ScheduledMatch) => {
    const styles: Record<string,{bg:string;color:string;label:string}> = {
      scheduled: { bg: `${C.navyLight}66`, color: C.cream, label: 'SCHEDULED' },
      completed: { bg: `${C.green}44`, color: C.greenLight, label: 'FINAL' },
      postponed: { bg: `${C.gold}44`, color: C.goldLight, label: 'POSTPONED' },
      forfeit:   { bg: `${C.red}44`,   color: C.redLight,  label: 'FORFEIT'   },
    };
    const s = styles[m.status] || styles.scheduled;
    return (
      <span className="font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded"
        style={{ background: s.bg, color: s.color }}>{s.label}</span>
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Calendar size={22} style={{ color: C.brandNavy }} />
          <h1 className="font-display text-2xl tracking-wider" style={{ color: C.brandNavyDeep, letterSpacing: '0.2em' }}>SCHEDULE</h1>
        </div>
        <div className="flex items-center gap-2">
          {seasons.length > 0 && (
            <select value={season} onChange={(e) => setSeason(e.target.value)}
              className="px-3 py-1.5 font-mono text-xs rounded"
              style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}>
              {seasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {isAdminUser && (
            <>
              <button
                onClick={() => setAdding(true)}
                className="px-3 py-1.5 font-heading tracking-wider text-xs rounded flex items-center gap-1.5"
                style={{ background: `${C.gold}44`, color: C.goldLight, border: `1px solid ${C.gold}66` }}
                title="Add a single match to any season/week"
              ><Plus size={12} /> ADD MATCH</button>
              <button
                onClick={() => setGenerating(true)}
                className="px-3 py-1.5 font-heading tracking-wider text-xs rounded flex items-center gap-1.5"
                style={{ background: C.green, color: C.onColor }}
              ><Plus size={12} /> NEW SEASON</button>
            </>
          )}
        </div>
      </div>

      {loadError && <p role="alert">{loadError}</p>}
      {loading ? (
        <div className="text-center py-8 font-mono text-sm" style={{ color: `${C.brandNavy}77` }}>Loading schedule...</div>
      ) : (filtered.length === 0 ? (
        <div className="text-center py-10 font-mono text-sm rounded" style={{ color: `${C.brandNavy}77`, background: `${C.navyLight}11`, border: `1px dashed ${C.navyLight}44` }}>
          No matches scheduled for this season yet. {isAdminUser ? 'Use ADD MATCH to build one at a time, or NEW SEASON to auto-generate a round-robin.' : 'The admin will post the fixtures when ready.'}
        </div>
      ) : (
        <div className="space-y-5">
          {/* ============ WEEK SLIDER ============
              Lets you jump directly to any week instead of scrolling through
              the whole season. "ALL" shows every week stacked (original view). */}
          {(() => {
            const weekNums = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
            if (weekNums.length < 2) return null; // only one week — no need for a slider
            const minWk = weekNums[0];
            const maxWk = weekNums.at(-1)!;
            return (
              <div className="rounded-lg p-3 flex items-center gap-3 flex-wrap" style={{
                background: C.white, border: `1px solid ${C.navyLight}33`,
              }}>
                <div className="flex items-center gap-2 shrink-0">
                  <Calendar size={14} style={{ color: C.brandNavy }} />
                  <span className="font-display tracking-widest text-sm" style={{ color: C.brandNavy }}>
                    {selectedWeek === null ? 'ALL WEEKS' : `WEEK ${selectedWeek}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={minWk}
                  max={maxWk}
                  value={selectedWeek ?? minWk}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                  className="flex-1 min-w-[150px]"
                  style={{ accentColor: C.brandNavy }}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setSelectedWeek(null)}
                    className="px-2 py-1 font-mono text-[10px] tracking-widest rounded"
                    style={selectedWeek === null
                      ? { background: C.brandNavy, color: C.onColor }
                      : { background: `${C.navyLight}44`, color: C.brandNavy }
                    }
                  >ALL</button>
                  <button
                    onClick={() => setSelectedWeek(w => w === null ? minWk : Math.max(minWk, w - 1))}
                    className="px-2 py-1 font-mono text-xs rounded"
                    style={{ background: `${C.navyLight}44`, color: C.brandNavy }}
                    disabled={selectedWeek === minWk}
                  >◀</button>
                  <span className="font-mono text-[10px] px-2 min-w-[60px] text-center" style={{ color: `${C.brandNavy}99` }}>
                    {selectedWeek === null ? `${minWk}–${maxWk}` : `${selectedWeek} / ${maxWk}`}
                  </span>
                  <button
                    onClick={() => setSelectedWeek(w => w === null ? minWk : Math.min(maxWk, w + 1))}
                    className="px-2 py-1 font-mono text-xs rounded"
                    style={{ background: `${C.navyLight}44`, color: C.brandNavy }}
                    disabled={selectedWeek === maxWk}
                  >▶</button>
                </div>
              </div>
            );
          })()}

          {Object.keys(byWeek)
            .map(Number)
            .filter(wkNum => selectedWeek === null || wkNum === selectedWeek)
            .sort((a, b) => a - b)
            .map(wkNum => (
            <div key={wkNum}>
              <div className="font-display tracking-widest text-sm mb-2 flex items-center gap-2" style={{ color: C.brandNavy }}>
                <span className="px-2 py-0.5 rounded" style={{ background: `${C.brandNavy}22` }}>WEEK {wkNum}</span>
                <span className="font-mono text-[10px]" style={{ color: `${C.brandNavy}77` }}>
                  {byWeek[wkNum].length} MATCH{byWeek[wkNum].length === 1 ? '' : 'ES'}
                </span>
              </div>
              <div className="space-y-3">
                {byWeek[wkNum].map(m => {
                  const home = teamById(m.homeTeamId);
                  const away = teamById(m.awayTeamId);
                  const played = m.status === 'completed' && m.homeScore !== null && m.awayScore !== null;
                  const homeColor = home?.color || C.brandNavy;
                  const awayColor = away?.color || C.brandNavy;
                  const homeWon = played && (m.homeScore || 0) > (m.awayScore || 0);
                  const awayWon = played && (m.awayScore || 0) > (m.homeScore || 0);

                  // Premium team unit: 56px logo + 24px tag + full name + record.
                  // The logo gets a tinted background + colored border + shadow
                  // so it reads as a real badge, not a thumbnail.
                  const TeamSide = ({ team, color, won, record, align = 'left' }: { team?: Team | null | undefined; color: string; won: boolean; record: string | null; align?: string }) => {
                    const flipped = align === 'right';
                    return (
                      <div
                        className="flex items-center min-w-0"
                        style={{
                          gap: 14,
                          flex: '1 1 0',
                          flexDirection: flipped ? 'row-reverse' : 'row',
                          textAlign: flipped ? 'right' : 'left',
                          position: 'relative', zIndex: 1,
                        }}
                      >
                        {team?.logoUrl ? (
                          <img
                            src={team.logoUrl}
                            alt={team.name}
                            className="shrink-0 object-contain"
                            style={{
                              width: 56, height: 56, borderRadius: 10, padding: 4,
                              background: `${color}11`,
                              border: `1.5px solid ${color}`,
                              boxShadow: `0 2px 8px ${color}33`,
                            }}
                          />
                        ) : (
                          <div className="shrink-0 flex items-center justify-center font-display tracking-wider"
                            style={{
                              width: 56, height: 56, borderRadius: 10,
                              background: color, color: C.onColor, fontSize: 18,
                              boxShadow: `0 2px 8px ${color}33`,
                            }}>
                            {team?.tag?.slice(0, 3) || '?'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-display truncate" style={{
                            fontSize: 24, letterSpacing: '0.08em', lineHeight: 1,
                            color, fontWeight: won ? 800 : 600, marginBottom: 4,
                          }}>
                            {team?.tag || '???'}
                          </div>
                          <div className="font-heading truncate" style={{
                            fontSize: 12, letterSpacing: '0.1em',
                            color: `${C.brandNavy}cc`,
                          }}>
                            {team?.name || 'TBD'}
                          </div>
                          {record && (
                            <div className="font-mono" style={{
                              fontSize: 10, letterSpacing: '0.18em', marginTop: 3,
                              color: `${C.brandNavy}aa`,
                            }}>{record}</div>
                          )}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div key={m.id}
                      className="rounded-xl overflow-hidden transition-all"
                      style={{
                        background: C.white,
                        border: `1px solid ${C.navyLight}66`,
                        boxShadow: `0 1px 3px ${C.brandNavy}0f, 0 4px 12px ${C.brandNavy}0a`,
                        position: 'relative',
                      }}
                    >
                      {/* Full-height color stripes on the far left/right edges */}
                      <div style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0,
                        width: 4, background: homeColor,
                      }} />
                      <div style={{
                        position: 'absolute', top: 0, bottom: 0, right: 0,
                        width: 4, background: awayColor,
                      }} />

                      {/* Top row: date + status + stream/edit controls */}
                      <div className="flex items-center justify-between gap-2 flex-wrap"
                        style={{
                          padding: '10px 24px',
                          background: `linear-gradient(90deg, ${C.navyLight}26 0%, ${C.navyLight}0d 100%)`,
                          borderBottom: `1px solid ${C.navyLight}66`,
                        }}>
                        <div className="font-mono flex items-center gap-2" style={{
                          fontSize: 11, letterSpacing: '0.18em', color: `${C.brandNavyDeep}cc`,
                        }}>
                          <Calendar size={13} style={{ color: `${C.brandNavyDeep}cc` }} />
                          {fmtDate(m.scheduledDate)}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {statusBadge(m)}
                          {m.streamUrl && (
                            <a href={m.streamUrl} target="_blank" rel="noopener noreferrer"
                              className="font-mono flex items-center gap-1 rounded-full"
                              style={{
                                fontSize: 10, letterSpacing: '0.2em', fontWeight: 700,
                                padding: '3px 10px',
                                background: '#9146FF22', color: '#9146FF',
                                border: '1px solid #9146FF55',
                              }}>▶ WATCH</a>
                          )}
                          {isAdminUser && (
                            <button
                              onClick={() => setEditing(m)}
                              className="font-mono rounded-full"
                              style={{
                                fontSize: 10, letterSpacing: '0.2em', fontWeight: 700,
                                padding: '3px 10px',
                                background: `${C.navyLight}cc`, color: C.brandNavy,
                              }}
                            >EDIT</button>
                          )}
                        </div>
                      </div>

                      {/* Main row — the hero: home | score/vs | away */}
                      <div className="relative" style={{
                        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                        alignItems: 'center', gap: 16, padding: '22px 24px',
                      }}>
                        {/* Subtle gradient tinting each side with team color */}
                        <div style={{
                          position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%',
                          background: `linear-gradient(90deg, ${homeColor} 0%, transparent 100%)`,
                          opacity: 0.06, pointerEvents: 'none',
                        }} />
                        <div style={{
                          position: 'absolute', top: 0, bottom: 0, right: 0, width: '40%',
                          background: `linear-gradient(270deg, ${awayColor} 0%, transparent 100%)`,
                          opacity: 0.06, pointerEvents: 'none',
                        }} />

                        <TeamSide team={home} color={homeColor} won={homeWon} record={recordStringFor(m.homeTeamId)} align="left" />

                        {/* Center — score when played, VS pill when upcoming */}
                        <div className="shrink-0 flex items-center" style={{ gap: 10, padding: '0 16px', position: 'relative', zIndex: 1 }}>
                          {played ? (
                            <>
                              <span className="font-display" style={{
                                fontSize: 42, lineHeight: 0.9, letterSpacing: '-0.02em',
                                color: homeColor, opacity: homeWon ? 1 : 0.4,
                                fontWeight: homeWon ? 800 : 400,
                              }}>{m.homeScore}</span>
                              <span className="font-display" style={{
                                fontSize: 24, color: `${C.brandNavy}99`,
                              }}>–</span>
                              <span className="font-display" style={{
                                fontSize: 42, lineHeight: 0.9, letterSpacing: '-0.02em',
                                color: awayColor, opacity: awayWon ? 1 : 0.4,
                                fontWeight: awayWon ? 800 : 400,
                              }}>{m.awayScore}</span>
                            </>
                          ) : (
                            <span className="font-display" style={{
                              fontSize: 22, letterSpacing: '0.2em',
                              color: `${C.brandNavy}aa`,
                              padding: '8px 16px',
                              background: `${C.navyLight}4d`,
                              border: `1px solid ${C.navyLight}99`,
                              borderRadius: 6,
                            }}>VS</span>
                          )}
                        </div>

                        <TeamSide team={away} color={awayColor} won={awayWon} record={recordStringFor(m.awayTeamId)} align="right" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {generating && (
        <GenerateScheduleModal
          allTeams={teams}
          existingSeasons={seasons}
          onClose={() => setGenerating(false)}
          onGenerated={(newSeason) => {
            // Make sure the season appears in the dropdown even if it has
            // zero matches (e.g. SKIP GENERATION was used).
            setEmptySeasons(prev => prev.includes(newSeason) ? prev : [...prev, newSeason]);
            setSeason(newSeason);
            void reload();
          }}
        />
      )}
      {adding && (
        <AddMatchModal
          allTeams={teams}
          existingSeasons={seasons}
          defaultSeason={season}
          onClose={() => setAdding(false)}
          onSaved={(usedSeason) => {
            setSeason(usedSeason);
            // The season now has at least one match, so it's no longer "empty"
            setEmptySeasons(prev => prev.filter(s => s !== usedSeason));
            void reload();
          }}
        />
      )}
      {editing && (
        <EditMatchModal
          match={editing}
          allTeams={teams}
          onClose={() => setEditing(null)}
          onSaved={() => { void reload(); }}
        />
      )}
    </div>
  );
};
