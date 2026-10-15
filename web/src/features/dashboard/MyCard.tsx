import { Activity, Calendar, Edit3, Share2, Shield, Sparkles, Target, TrendingUp, Trophy, User, Zap } from 'lucide-react';
import type { Account, Rankings } from '../accounts/models';
import type { Team } from '../teams/models';
import { AWARD_BY_ID, AwardIcon } from '../../components/Icons';
import { PlayerCard } from '../../components/PlayerCard';
import { Metric, RecordBox } from '../../components/Ui';
import { C } from '../../theme/theme';
import { getStatsForSeason } from '../../utils/rankings';

export type CardAction = 'share' | 'image' | 'pos' | 'name';
interface Props {
  account: Account; season: string; currentSeason: string; allSeasons: string[];
  setSeason: (season: string) => void; myTeam: Team | undefined; rankings: Rankings;
  onEdit: (action: CardAction) => void;
}
export function MyCard({ account, season, currentSeason, allSeasons, setSeason, myTeam, rankings, onEdit }: Props) {
  const seasonStats = getStatsForSeason(account, season);
  const games = seasonStats.games || 0;
  const wr = games > 0 ? Math.round(seasonStats.wins / games * 100) : 0;
  const gpg = games > 0 ? (seasonStats.goals / games).toFixed(2) : '0.00';
  const apg = games > 0 ? (seasonStats.assists / games).toFixed(2) : '0.00';
  const accountForCard = { ...account, stats: seasonStats };
  return (
          <div className="space-y-6">
            {/* SEASON FILTER BANNER */}
            <div className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" style={{
              background: `linear-gradient(135deg, ${C.brandNavy} 0%, ${C.navyLight}dd 100%)`,
              border: `1px solid ${C.navyLight}`,
              boxShadow: `0 2px 12px ${C.brandNavy}22`,
            }}>
              <div className="flex items-center gap-2">
                <Calendar size={16} style={{ color: C.goldLight }} />
                <span className="font-mono text-[10px] tracking-[0.25em]" style={{ color: `${C.onColor}99` }}>VIEWING STATS FOR</span>
                <span className="font-display text-xl tracking-wider" style={{ color: C.goldLight }}>
                  {season === 'all' ? 'ALL TIME' : `SEASON ${season}`}
                </span>
              </div>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setSeason('all')}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded transition-all"
                  style={{
                    background: season === 'all' ? C.goldLight : `${C.brandNavyDeep}88`,
                    color: season === 'all' ? C.brandNavy : `${C.onColor}cc`,
                    border: `1px solid ${season === 'all' ? C.goldLight : C.onColor}33`,
                  }}
                >ALL TIME</button>
                {allSeasons.map(s => (
                  <button
                    key={s}
                    onClick={() => setSeason(s)}
                    className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded transition-all"
                    style={{
                      background: season === s ? C.goldLight : `${C.brandNavyDeep}88`,
                      color: season === s ? C.brandNavy : `${C.onColor}cc`,
                      border: `1px solid ${season === s ? C.goldLight : C.onColor}33`,
                    }}
                  >{s}{s === currentSeason ? ' ●' : ''}</button>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
              <div className="flex flex-col items-center gap-3">
                <PlayerCard account={accountForCard} size="lg" team={myTeam} rankings={rankings} />
                <div className="flex gap-2 flex-wrap justify-center">
                  <button
                    onClick={() => onEdit('share')}
                    className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all hover:scale-105"
                    style={{
                      background: C.brandNavy, color: C.onColor,
                      boxShadow: `0 2px 8px ${C.brandNavy}66`,
                    }}
                  ><Share2 size={12} /> SHARE CARD</button>
                  <button
                    onClick={() => onEdit('image')}
                    className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all"
                    style={{
                      background: `${C.navyLight}66`, color: C.cream, border: `1px solid ${C.navyLight}`,
                    }}
                  ><User size={12} /> IMAGE</button>
                  <button
                    onClick={() => onEdit('pos')}
                    className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all"
                    style={{
                      background: `${C.navyLight}66`, color: C.cream, border: `1px solid ${C.navyLight}`,
                    }}
                  ><Edit3 size={12} /> POSITION</button>
                  <button
                    onClick={() => onEdit('name')}
                    className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all"
                    style={{
                      background: `${C.navyLight}66`, color: C.cream, border: `1px solid ${C.navyLight}`,
                    }}
                  ><Edit3 size={12} /> NAME</button>
                </div>
                {myTeam && (
                  <div className="text-center mt-1">
                    <div className="font-mono text-[9px] tracking-[0.3em]" style={{ color: `${C.cream}66` }}>PLAYS FOR</div>
                    <div className="font-display text-lg tracking-wider" style={{ color: myTeam.color || C.greenLight }}>{myTeam.name.toUpperCase()}</div>
                  </div>
                )}
                {(account.awards || []).length > 0 && (
                  <div className="rounded-lg px-3 py-2.5 w-full max-w-[300px]" style={{
                    background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
                    border: `1px solid ${C.gold}66`,
                    boxShadow: `0 2px 8px ${C.gold}33`,
                  }}>
                    <div className="font-mono text-[9px] tracking-[0.3em] text-center mb-2" style={{ color: `${C.gold}cc` }}>
                      TROPHY CABINET
                    </div>
                    <div className="space-y-1">
                      {(account.awards || []).map((aw, i) => {
                        const a = AWARD_BY_ID[aw.awardId];
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <AwardIcon awardId={aw.awardId} size={20} />
                            <span className="font-heading text-[11px] tracking-wider flex-1" style={{ color: C.cream }}>
                              {(a?.name ?? aw.awardId).toUpperCase()}
                            </span>
                            <span className="font-mono text-[10px]" style={{ color: C.goldLight }}>{aw.season}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-display text-2xl tracking-wider mb-3 flex items-center gap-2">
                    <Sparkles size={16} style={{ color: C.goldLight }} />
                    CAREER OVERVIEW
                    {season !== 'all' && (
                      <span className="font-mono text-[9px] px-2 py-0.5 rounded tracking-wider" style={{
                        background: `${C.gold}22`, color: C.goldLight, border: `1px solid ${C.gold}44`,
                      }}>{season}</span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Metric icon={<Activity />} label="GAMES" value={games} accent={C.greenLight} />
                    <Metric icon={<TrendingUp />} label="WIN RATE" value={`${wr}%`} accent={C.greenLight} />
                    <Metric icon={<Target />} label="GOALS" value={seasonStats.goals || 0} accent={C.redLight} />
                    <Metric icon={<Zap />} label="ASSISTS" value={seasonStats.assists || 0} accent={C.goldLight} />
                    <Metric icon={<Target />} label="G / GAME" value={gpg} accent={C.redLight} />
                    <Metric icon={<Zap />} label="A / GAME" value={apg} accent={C.goldLight} />
                    <Metric icon={<Shield />} label="CLEAN SHEETS" value={seasonStats.cleanSheets || 0} accent={C.greenLight} />
                    <Metric icon={<Trophy />} label="AWARDS" value={(account.awards || []).length} accent={C.goldLight} />
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-2xl tracking-wider mb-3 flex items-center gap-2">
                    <Trophy size={16} style={{ color: C.goldLight }} /> RECORD
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <RecordBox value={seasonStats.wins || 0} label="WINS" color={C.greenLight} />
                    <RecordBox value={seasonStats.draws || 0} label="DRAWS" color={C.goldLight} />
                    <RecordBox value={seasonStats.losses || 0} label="LOSSES" color={C.redLight} />
                  </div>
                </div>
              </div>
            </div>
          </div>

  );
}
