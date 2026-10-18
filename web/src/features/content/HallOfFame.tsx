import { Calendar, Crown, Sparkles, Trophy } from 'lucide-react';
import { settings as adminApi } from '../admin/api';
import type { Account, PlayerAward } from '../accounts/models';
import type { Champions } from '../admin/models';
import type { Team } from '../teams/models';
import { AWARD_TYPES, AwardIcon, ChampionTrophy } from '../../components/Icons';
import { EmptyState } from '../../components/Display';
import { useResource } from '../../hooks/use-resource';
import { C } from '../../theme/theme';

// ============ HALL OF FAME ============
export const HallOfFameView = ({ allPlayers, allTeams, onPlayerClick }: { allPlayers: Account[]; allTeams: Team[]; onPlayerClick?: (account:Account) => void }) => {
  const {
    data: loadedChampions,
    loading: championsLoading,
    error: championsError,
    reload: reloadChampions,
  } = useResource<Champions | undefined>(() => adminApi.getChampions(), []);
  const champions: Champions = loadedChampions || {};
  const teamById = (id: string | null | undefined) => (allTeams || []).find(t => t.id === id);

  // Build a map: { season → { awardId → { player, award } } }
  const bySeason:Record<string,Record<string,{player:Account;award:PlayerAward}>> = {};
  allPlayers.forEach(p => {
    (p.awards || []).forEach(aw => {
      if (!bySeason[aw.season]) bySeason[aw.season] = {};
      bySeason[aw.season][aw.awardId] = { player: p, award: aw };
    });
  });
  const seasons = Object.keys(bySeason).sort((a,b)=>b.localeCompare(a));
  const championSeasons = Object.keys(champions).sort((a,b)=>b.localeCompare(a));

  // Per-player count for "most decorated" leaderboard
  const decoratedPlayers = allPlayers
    .filter(p => (p.awards || []).length > 0)
    .map(p => ({ player: p, count: p.awards.length }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Crown size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>HALL OF FAME</h3>
      </div>

      {/* SEASON CHAMPIONS — winner + runner-up per season */}
      {championsLoading && (
        <div role="status" className="mb-6 font-mono text-sm" style={{ color: `${C.cream}66` }}>Loading season champions...</div>
      )}
      {championsError && (
        <div role="alert" className="mb-6 flex items-center gap-3 font-mono text-xs" style={{ color: C.redLight }}>
          <span>Could not load season champions: {championsError}</span>
          <button
            type="button"
            onClick={() => { void reloadChampions(); }}
            disabled={championsLoading}
            className="underline disabled:opacity-50"
          >RETRY</button>
        </div>
      )}
      {!championsLoading && !championsError && championSeasons.length > 0 && (
        <div className="mb-8">
          <h4 className="font-display text-xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
            <Trophy size={16} style={{ color: C.goldLight }} /> SEASON CHAMPIONS
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {championSeasons.map(s => {
              const info = champions[s];
              const w = info.winnerTeamId ? teamById(info.winnerTeamId) : null;
              const r = info.runnerUpTeamId ? teamById(info.runnerUpTeamId) : null;
              return (
                <div key={s} className="rounded-xl p-4" style={{
                  background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
                  border: `1px solid ${C.gold}55`,
                  boxShadow: `0 2px 10px ${C.gold}22`,
                }}>
                  <div className="font-display text-2xl tracking-wider mb-3" style={{ color: C.brandNavy }}>{s}</div>
                  <div className="flex items-start gap-3 mb-2">
                    <ChampionTrophy size={32} tone="gold" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.brandNavy}88` }}>CHAMPION</div>
                      <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.brandNavy }}>
                        {w ? w.name : <span style={{ fontStyle: 'italic', color: `${C.brandNavy}66` }}>—</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ChampionTrophy size={28} tone="silver" />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.brandNavy}88` }}>RUNNER-UP</div>
                      <div className="font-heading tracking-wider text-sm truncate" style={{ color: `${C.brandNavy}cc` }}>
                        {r ? r.name : <span style={{ fontStyle: 'italic', color: `${C.brandNavy}66` }}>—</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {seasons.length === 0 ? (
        <EmptyState icon={<Trophy size={40} />} text="No individual award winners yet." />
      ) : (
        <>
          {/* MOST DECORATED */}
          {decoratedPlayers.length > 0 && (
            <div className="mb-6">
              <h4 className="font-display text-xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
                <Sparkles size={14} style={{ color: C.goldLight }} /> MOST DECORATED
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {decoratedPlayers.slice(0, 8).map(({ player, count }) => (
                  <button
                    key={player.username}
                    onClick={() => onPlayerClick?.(player)}
                    className="rounded-lg p-3 text-center transition-all hover:scale-[1.03]"
                    style={{
                      background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
                      border: `1px solid ${C.gold}66`,
                      boxShadow: `0 2px 8px ${C.gold}33`,
                    }}
                  >
                    <div className="flex justify-center gap-1 mb-2">
                      {(player.awards || []).slice(0, 4).map((aw, i) => (
                        <AwardIcon key={i} awardId={aw.awardId} size={20} />
                      ))}
                    </div>
                    <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>
                      {player.username.toUpperCase()}
                    </div>
                    <div className="font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
                      {count} {count === 1 ? 'AWARD' : 'AWARDS'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SEASONS */}
          <h4 className="font-display text-xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
            <Calendar size={14} style={{ color: C.goldLight }} /> WINNERS BY SEASON
          </h4>
          <div className="space-y-4">
            {seasons.map(s => (
              <div key={s} className="rounded-xl p-4" style={{
                background: C.white,
                border: `1px solid ${C.gold}55`,
                boxShadow: `0 2px 12px ${C.gold}22`,
              }}>
                <div className="font-display text-2xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
                  <span style={{ color: C.goldLight }}>SEASON</span> {s}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {AWARD_TYPES.map(at => {
                    const winner = bySeason[s][at.id];
                    return (
                      <div key={at.id} className="rounded-lg p-3" style={{
                        background: winner ? `${C.gold}11` : `${C.navyLight}33`,
                        border: `1px solid ${winner ? C.gold + '55' : C.navyLight}`,
                        opacity: winner ? 1 : 0.55,
                      }}>
                        <div className="flex items-center gap-2 mb-2">
                          <AwardIcon awardId={at.id} size={28} />
                          <div>
                            <div className="font-heading text-[11px] tracking-wider" style={{ color: C.cream }}>{at.name.toUpperCase()}</div>
                            <div className="font-mono text-[9px]" style={{ color: `${C.cream}66` }}>{at.desc.toUpperCase()}</div>
                          </div>
                        </div>
                        {winner ? (
                          <button
                            onClick={() => onPlayerClick?.(winner.player)}
                            className="w-full text-left mt-1 px-2 py-1.5 rounded transition-all hover:scale-[1.02]"
                            style={{ background: C.white, border: `1px solid ${C.gold}33` }}
                          >
                            <div className="font-display text-lg tracking-wider" style={{ color: C.cream }}>
                              {winner.player.username.toUpperCase()}
                            </div>
                            <div className="font-mono text-[10px]" style={{ color: `${C.cream}66` }}>
                              {winner.player.position}
                            </div>
                          </button>
                        ) : (
                          <div className="text-center font-mono text-[10px] py-2" style={{ color: `${C.cream}55` }}>
                            — VACANT —
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
