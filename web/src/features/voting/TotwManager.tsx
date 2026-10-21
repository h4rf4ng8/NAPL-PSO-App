import { useRestPage } from '../../hooks/use-rest-page';
import { useResource } from '../../hooks/use-resource';
import { PageButtons } from '../../components/PageButtons';
import { request } from '../../api/http';
import { z } from 'zod';
import type { AdminPlayer } from '../accounts/models';
import { Check, Trophy } from 'lucide-react';
import { useState } from 'react';
import { VOTE_FIELDS, VOTE_POSITIONS } from '@napl/contracts/league';
import { voting as votingApi } from './api';
import type { VotingPeriod } from './models';
import { C } from '../../theme/theme';

type PeriodSummary = Omit<VotingPeriod,'eligiblePlayers'|'winners'> & {eligiblePlayerCount:number;winnerCount:number};
const tallySchema = z.object({totalVotes:z.number().nonnegative(),positions:z.object({GK:z.array(z.tuple([z.string(),z.number()])),DEF:z.array(z.tuple([z.string(),z.number()])),CM:z.array(z.tuple([z.string(),z.number()])),ST:z.array(z.tuple([z.string(),z.number()]))})});

// ============ TEAM OF THE WEEK VOTING ADMIN ============
// Admin opens a voting period, picks eligible players, players vote, admin
// resolves the winners after voting closes. Each period auto-closes at
// midnight the day after it opens.
export const TotwManager = ({ onRefresh }: { onRefresh: () => void }) => {
  const periodPage = useRestPage<PeriodSummary>('/api/voting/periods');
  const openPage = useRestPage<PeriodSummary>('/api/voting/periods?status=open');
  const periods = periodPage.data?.nodes ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]); // usernames
  const [filter, setFilter] = useState('');
  const playerPage = useRestPage<AdminPlayer>('/api/accounts?search='+encodeURIComponent(filter));
  const allPlayers = playerPage.data?.nodes ?? [];
  const minimumEligible = VOTE_FIELDS.reduce((total, field) => total + field.needed, 0);
  const minimumEligibleSummary = VOTE_FIELDS.map(({ needed, pos }) => `${needed} ${pos}`).join(' + ');
  const votePositionSummary = VOTE_FIELDS.map(({ pos }) => `1 ${pos}`).join(' + ');

  const currentPeriod = openPage.data?.nodes.find(period=>period.status==='open');
  const pastPeriods = periods.filter(period=>period.status!=='open');
  const tallyResource = useResource(async()=>currentPeriod
    ? tallySchema.parse(await request(`/api/voting/periods/${encodeURIComponent(currentPeriod.id)}/tally`))
    : {totalVotes:0,positions:{GK:[],DEF:[],CM:[],ST:[]}},[currentPeriod?.id]);
  const tally = tallyResource.data?.positions ?? {GK:[],DEF:[],CM:[],ST:[]};
  const refresh = async () => { await Promise.all([periodPage.reload(),openPage.reload(),tallyResource.reload()]); };

  // Helper: midnight the day after opens_at
  const computeCloseTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  };


  const togglePlayer = (username: string) => {
    setSelectedPlayers(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  };

  const handleCreate = async () => {
    setError(''); setBusy(true);
    try {
      if (selectedPlayers.length < minimumEligible) {
        setError(`Pick at least ${minimumEligible} eligible players (${minimumEligibleSummary} minimum).`);
        setBusy(false); return;
      }
      await votingApi.createTotwPeriod({
        closesAt: computeCloseTime(),
        eligiblePlayers: selectedPlayers,
      });
      setInfo('✓ Voting period opened');
      setCreating(false);
      setSelectedPlayers([]);
      await refresh();
      onRefresh?.();
      setTimeout(() => setInfo(''), 4000);
    } catch (error_) {
      setError('Could not create period: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const handleClose = async () => {
    if (!currentPeriod || !confirm('Close voting now? Voters won\'t be able to submit any more votes.')) return;
    setBusy(true);
    try {
      await votingApi.updateTotwPeriod(currentPeriod.id, { status: 'closed' });
      setInfo('✓ Voting closed. Winners can be picked in Deploy 2.');
      await refresh();
      onRefresh?.();
      setTimeout(() => setInfo(''), 4000);
    } catch (error_) {
      setError('Could not close period: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const handleDelete = async (periodId: string) => {
    if (!confirm('Delete this voting period? All votes will be lost.')) return;
    setBusy(true);
    try {
      await votingApi.deleteTotwPeriod(periodId);
      setInfo('✓ Period deleted');
      await refresh();
      onRefresh?.();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) {
      setError('Could not delete: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const approvedPlayers = allPlayers
    .filter(p => !filter || p.username.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.username.localeCompare(b.username));

  return (
    <div className="space-y-4">
      {(periodPage.loading || openPage.loading || tallyResource.loading) && <p role="status">Loading voting data…</p>}
      {(periodPage.error || openPage.error || tallyResource.error || playerPage.error) && <p role="alert">{periodPage.error || openPage.error || tallyResource.error || playerPage.error}</p>}
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, #2196f322 0%, ${C.white} 100%)`,
        border: `1px solid #2196f355`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={14} style={{ color: '#2196f3' }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>TEAM OF THE WEEK VOTING</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Open a voting period each week. Pick eligible players (anyone who played that week). Players vote {votePositionSummary}. Voting auto-closes at midnight the next day. Admin picks the winners after voting closes.
        </p>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}
      {error && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>
      )}

      {/* CURRENT PERIOD */}
      <div className="rounded-lg p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div className="font-mono text-[10px] tracking-[0.25em] mb-2" style={{ color: `${C.brandNavy}77` }}>CURRENT VOTING PERIOD</div>
        {currentPeriod ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>
                  OPEN · CLOSES {new Date(currentPeriod.closesAt).toLocaleString()}
                </div>
                <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                  {currentPeriod.eligiblePlayerCount} ELIGIBLE PLAYERS · {tallyResource.data?.totalVotes ?? '…'} VOTES CAST
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={busy}
                className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                style={{ background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66` }}
              >CLOSE NOW</button>
            </div>

            {/* Live tally per position */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {VOTE_POSITIONS.map(pos => (
                <div key={pos} className="rounded p-2" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}44` }}>
                  <div className="font-display text-xs tracking-wider mb-1" style={{ color: '#2196f3' }}>{pos}</div>
                  {tally[pos].length === 0 ? (
                    <div className="font-mono text-[9px]" style={{ color: `${C.cream}55` }}>NO VOTES YET</div>
                  ) : (
                    tally[pos].slice(0, 5).map(([username, count]) => (
                      <div key={username} className="flex justify-between gap-2 font-mono text-[10px] py-0.5" style={{ color: C.cream }}>
                        <span className="truncate">{username}</span>
                        <span style={{ color: `${C.cream}99` }}>{count}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="font-mono text-xs tracking-wider" style={{ color: `${C.brandNavy}66` }}>NO ACTIVE VOTING PERIOD</div>
            {creating ? (
              <div className="space-y-3">
                <div className="font-mono text-[10px] tracking-[0.2em]" style={{ color: `${C.brandNavy}77` }}>
                  PICK ELIGIBLE PLAYERS · {selectedPlayers.length} SELECTED
                </div>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search players…"
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
                />
                <PageButtons {...playerPage} hasNextPage={playerPage.data?.pageInfo.hasNextPage ?? false} />
                <div className="rounded max-h-64 overflow-y-auto" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66` }}>
                  {approvedPlayers.map(p => {
                    const checked = selectedPlayers.includes(p.username);
                    return (
                      <button
                        key={p.username}
                        type="button"
                        onClick={() => togglePlayer(p.username)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left"
                        style={{
                          borderBottom: `1px solid ${C.navyLight}33`,
                          background: checked ? `#2196f322` : 'transparent',
                        }}
                      >
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{
                          border: `1.5px solid ${checked ? '#2196f3' : `${C.cream}55`}`,
                          background: checked ? '#2196f3' : 'transparent',
                        }}>
                          {checked && <Check size={11} style={{ color: '#fff' }} />}
                        </div>
                        <span className="font-heading tracking-wider text-sm flex-1" style={{ color: C.cream }}>{p.username}</span>
                        <span className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}66` }}>{p.position}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCreating(false); setSelectedPlayers([]); }}
                    className="px-3 py-2 font-heading tracking-wider text-[11px] rounded"
                    style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                  >CANCEL</button>
                  <button
                    onClick={handleCreate}
                    disabled={busy || selectedPlayers.length < 8}
                    className="flex-1 py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                    style={{ background: '#2196f3', color: '#fff' }}
                  >{busy ? 'OPENING…' : `OPEN PERIOD (${selectedPlayers.length} PLAYERS)`}</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setCreating(true); setSelectedPlayers([]); }}
                className="w-full py-2 font-heading tracking-wider text-[11px] rounded"
                style={{ background: '#2196f3', color: '#fff' }}
              >OPEN NEW VOTING PERIOD</button>
            )}
          </div>
        )}
      </div>

      <PageButtons {...periodPage} hasNextPage={periodPage.data?.pageInfo.hasNextPage ?? false} />
      {/* PAST PERIODS */}
      {pastPeriods.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
          <div className="font-mono text-[10px] tracking-[0.25em] mb-2" style={{ color: `${C.brandNavy}77` }}>PAST PERIODS</div>
          <div className="space-y-1">
            {pastPeriods.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ background: C.navyDeep }}>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] tracking-wider" style={{ color: C.cream }}>
                    {p.status.toUpperCase()} · {new Date(p.opensAt).toLocaleDateString()}
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: `${C.cream}66` }}>
                    {p.eligiblePlayerCount} ELIGIBLE{p.winnerCount > 0 ? ' · RESOLVED' : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="px-2 py-1 font-mono text-[9px] rounded"
                  style={{ background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}55` }}
                >DELETE</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
