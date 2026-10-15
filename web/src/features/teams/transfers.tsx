import { Swords, User } from 'lucide-react';
import { useMemo,useState } from 'react';
import { teams as teamApi } from './api';
import { useResource } from '../../hooks/use-resource';
import type { Account } from '../accounts/models';
import type { Transfer } from './models';


import { C } from '../../theme/theme';

import { isAdmin } from '../../utils/league';

// ============ TRANSFERS VIEW ============
// Shows every roster move (signings, transfers between teams, releases) as a
// chronological feed. Season filter dropdown, window badges per Rulebook,
// admin can edit the window tag on any entry.
export const TransfersView = ({ account }: { account: Account | null }) => {
  const { data, loading, error, reload } = useResource(async () => {
    const [transfers, teams] = await Promise.all([teamApi.listTransfers(), teamApi.listTeams()]);
    return { transfers, teams };
  }, []);
  const transfers = data?.transfers ?? [];
  const teams = data?.teams ?? [];
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [editingWindow, setEditingWindow] = useState<Transfer | null>(null);
  const isAdminUser = isAdmin(account);

  const teamById = (id: string | null | undefined) => teams.find(t => t.id === id);
  const fmtDate = (ms: number | null | undefined) => {
    if (!ms) return '';
    const d = new Date(ms);
    const diff = Date.now() - ms;
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return days < 7 ? `${days} days ago` : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const seasons = useMemo(() => {
    const set = new Set<string>();
    transfers.forEach(t => { if (t.season) set.add(t.season); });
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, [transfers]);

  const filtered = seasonFilter === 'all'
    ? transfers
    : transfers.filter(t => t.season === seasonFilter);

  // Chip style for each transfer kind
  const kindChip = (kind: string) => {
    const map:Record<string,{bg:string;color:string;label:string}> = {
      signing:  { bg: `${C.green}22`,  color: C.greenLight, label: 'SIGNING' },
      transfer: { bg: `${C.gold}22`,   color: C.goldLight,  label: 'TRANSFER' },
      release:  { bg: `${C.red}22`,    color: C.redLight,   label: 'RELEASE' },
    };
    const c = map[kind] || map.transfer;
    return (
      <span className="font-mono px-2 py-0.5 rounded-full" style={{
        background: c.bg, color: c.color,
        fontSize: 10, letterSpacing: '0.2em', fontWeight: 700,
      }}>{c.label}</span>
    );
  };

  // Window badge (League Window / Cross League Window)
  const windowBadge = (type: string | null) => {
    if (!type) return null;
    const map:Record<string,{bg:string;color:string;label:string}> = {
      league:       { label: 'LEAGUE WINDOW',       bg: `${C.brandNavy}33`,  color: C.brandNavyDeep },
      cross_league: { label: 'CROSS-LEAGUE WINDOW', bg: `${C.gold}44`, color: C.goldLight },
    };
    const c = map[type]; if (!c) return null;
    return (
      <span className="font-mono px-2 py-0.5 rounded-full" style={{
        background: c.bg, color: c.color,
        fontSize: 10, letterSpacing: '0.2em', fontWeight: 700,
      }}>◆ {c.label}</span>
    );
  };

  // Compact team display with logo + tag, or "FREE AGENT" placeholder
  const TeamChip = ({ teamId, color: forcedColor }: { teamId: string | null; color?: string }) => {
    if (!teamId) {
      return (
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 rounded flex items-center justify-center" style={{
            width: 32, height: 32,
            background: `${C.navyLight}66`,
            border: `1px dashed ${C.brandNavy}55`,
          }}>
            <User size={14} style={{ color: `${C.brandNavy}99` }} />
          </div>
          <span className="font-mono truncate" style={{
            fontSize: 11, letterSpacing: '0.15em', color: `${C.brandNavy}99`,
          }}>FREE AGENT</span>
        </div>
      );
    }
    const t = teamById(teamId);
    const color = forcedColor || t?.color || C.brandNavy;
    return (
      <div className="flex items-center gap-2 min-w-0">
        {t?.logoUrl ? (
          <img src={t.logoUrl} alt={t.name} className="shrink-0 object-contain" style={{
            width: 32, height: 32, borderRadius: 6, padding: 2,
            background: `${color}11`,
            border: `1px solid ${color}66`,
          }} />
        ) : (
          <div className="shrink-0 flex items-center justify-center font-display" style={{
            width: 32, height: 32, borderRadius: 6,
            background: color, color: C.onColor, fontSize: 11, letterSpacing: '0.08em',
          }}>{t?.tag?.slice(0, 3) || '?'}</div>
        )}
        <div className="min-w-0">
          <div className="font-display truncate" style={{
            color, fontSize: 14, letterSpacing: '0.08em', lineHeight: 1,
          }}>{t?.tag || '???'}</div>
          <div className="font-mono truncate" style={{
            fontSize: 9, letterSpacing: '0.15em', color: `${C.brandNavy}aa`, marginTop: 2,
          }}>{t?.name || 'Unknown team'}</div>
        </div>
      </div>
    );
  };

  const setWindow = async (tx: Transfer, newType: string | null) => {
    try {
      await teamApi.saveTransfer({ ...tx, windowType: newType });
      setEditingWindow(null);
      void reload();
    } catch (error) {
      alert('Could not update window: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const deleteTransfer = async (tx: Transfer) => {
    if (!confirm(`Delete this transfer entry? This removes it from the log but doesn't undo the roster move.`)) return;
    try {
      await teamApi.deleteTransfer(tx.id);
      void reload();
    } catch (error) {
      alert('Could not delete: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Swords size={22} style={{ color: C.brandNavy }} />
          <h1 className="font-display text-2xl tracking-wider" style={{ color: C.brandNavyDeep, letterSpacing: '0.2em' }}>TRANSFER MARKET</h1>
        </div>
        {seasons.length > 0 && (
          <div className="flex gap-1 rounded p-0.5 flex-wrap" style={{ background: `${C.navyLight}66` }}>
            <button
              onClick={() => setSeasonFilter('all')}
              className="px-3 py-1 font-mono text-xs tracking-widest rounded"
              style={seasonFilter === 'all'
                ? { background: C.goldLight, color: C.brandNavyDeep }
                : { color: C.brandNavy }
              }
            >ALL</button>
            {seasons.map(s => (
              <button
                key={s}
                onClick={() => setSeasonFilter(s)}
                className="px-3 py-1 font-mono text-xs tracking-widest rounded"
                style={seasonFilter === s
                  ? { background: C.goldLight, color: C.brandNavyDeep }
                  : { color: C.brandNavy }
                }
              >{s}</button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="text-center py-8 font-mono text-sm" style={{ color: `${C.brandNavy}77` }}>Loading transfer activity...</div>}
      {!loading && error && <div role="alert" className="text-center py-8 font-mono text-sm" style={{ color: C.red }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-10 font-mono text-sm rounded" style={{
          color: `${C.brandNavy}77`, background: `${C.navyLight}11`, border: `1px dashed ${C.navyLight}66`,
        }}>
          No transfer activity yet. As admins move players between teams, every signing / transfer / release will show up here.
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(tx => {
            
            
            return (
              <div key={tx.id} className="rounded-lg overflow-hidden" style={{
                background: C.white,
                border: `1px solid ${C.navyLight}66`,
                boxShadow: `0 1px 3px ${C.brandNavy}0f`,
              }}>
                {/* Top row — kind + window badge + date */}
                <div className="flex items-center justify-between gap-2 px-4 py-2 flex-wrap" style={{
                  borderBottom: `1px solid ${C.navyLight}44`,
                  background: `${C.navyLight}1a`,
                }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {kindChip(tx.kind)}
                    {windowBadge(tx.windowType)}
                  </div>
                  <div className="font-mono flex items-center gap-3" style={{
                    fontSize: 10, letterSpacing: '0.15em', color: `${C.brandNavy}99`,
                  }}>
                    <span>{fmtDate(tx.createdAt)}</span>
                    {tx.season && <span style={{ color: C.goldLight }}>• {tx.season}</span>}
                    {isAdminUser && (
                      <>
                        <button
                          onClick={() => setEditingWindow(tx)}
                          className="px-2 py-0.5 rounded"
                          style={{ background: `${C.navyLight}66`, color: C.brandNavy, fontSize: 9 }}
                        >◆ WINDOW</button>
                        <button
                          onClick={() => deleteTransfer(tx)}
                          className="px-2 py-0.5 rounded"
                          style={{ background: `${C.red}22`, color: C.redLight, fontSize: 9 }}
                        >DEL</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Main row — player + FROM team → TO team */}
                <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <div className="font-display tracking-wider shrink-0 flex items-center gap-2" style={{
                    color: C.brandNavyDeep, fontSize: 18,
                  }}>
                    <User size={16} style={{ color: `${C.brandNavy}77` }} />
                    {tx.playerUsername}
                  </div>
                  <div className="flex items-center gap-3 flex-1 flex-wrap">
                    <TeamChip teamId={tx.fromTeamId} />
                    <div className="font-display shrink-0" style={{
                      fontSize: 18, color: `${C.brandNavy}66`, letterSpacing: '0.1em',
                    }}>→</div>
                    <TeamChip teamId={tx.toTeamId} />
                  </div>
                </div>

                {/* Window edit picker inline */}
                {editingWindow && editingWindow.id === tx.id && (
                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{
                    borderTop: `1px solid ${C.navyLight}44`,
                    background: `${C.gold}0a`,
                  }}>
                    <span className="font-mono text-[10px] tracking-widest" style={{ color: C.brandNavy }}>
                      TAG WINDOW:
                    </span>
                    <button onClick={() => setWindow(tx, null)}
                      className="px-2 py-1 font-mono text-[10px] tracking-widest rounded"
                      style={tx.windowType
                        ? { background: `${C.navyLight}66`, color: C.brandNavy }
                        : { background: C.green, color: C.onColor }
                      }>NONE</button>
                    <button onClick={() => setWindow(tx, 'league')}
                      className="px-2 py-1 font-mono text-[10px] tracking-widest rounded"
                      style={tx.windowType === 'league'
                        ? { background: C.brandNavy, color: C.onColor }
                        : { background: `${C.navyLight}66`, color: C.brandNavy }
                      }>LEAGUE WINDOW</button>
                    <button onClick={() => setWindow(tx, 'cross_league')}
                      className="px-2 py-1 font-mono text-[10px] tracking-widest rounded"
                      style={tx.windowType === 'cross_league'
                        ? { background: C.gold, color: C.brandNavyDeep }
                        : { background: `${C.navyLight}66`, color: C.brandNavy }
                      }>CROSS-LEAGUE WINDOW</button>
                    <button onClick={() => setEditingWindow(null)}
                      className="px-2 py-1 font-mono text-[10px] tracking-widest rounded"
                      style={{ background: `${C.red}22`, color: C.redLight }}>CLOSE</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
