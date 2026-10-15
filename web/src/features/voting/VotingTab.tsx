import { Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { VOTE_FIELDS, VOTE_POSITIONS, type VoteKey, type VotePosition } from '@napl/contracts/league';
import { voting as votingApi } from './api';
import type { Account, Rankings } from '../accounts/models';
import type { VotingPeriod } from './models';
import { C } from '../../theme/theme';
import { useResource } from '../../hooks/use-resource';
import { choicesFromVotes, emptyVoteChoices, hasCompleteVote } from './voting-utils';

// ============ DASHBOARD ============
// ============ VOTING TAB (player-facing) ============
// Shown only when there's an open voting period. Players pick 1 player per
// configured vote position from the eligible pool, then submit. Once
// submitted, the tab shows what they voted for and lets them change votes
// until the period closes.
export const VotingTab = ({ account, period, allPlayers, rankings, onRefresh }: { account: Account; period: VotingPeriod; allPlayers: Account[]; rankings?: Rankings | null; onRefresh: () => void }) => {
  const [myVotes, setMyVotes] = useState(emptyVoteChoices);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Build candidate list per position from the eligible_players list.
  // Each candidate gets their season stats attached for the voter to inspect.
  // Excludes the voter themselves (can't vote for yourself).
  const candidates = useMemo(() => {
    const result = {} as Record<VotePosition, Account[]>;
    for (const position of VOTE_POSITIONS) result[position] = [];
    for (const username of (period.eligiblePlayers || [])) {
      if (username.toLowerCase() === account.username.toLowerCase()) continue;
      const p = allPlayers.find(x => x.username.toLowerCase() === username.toLowerCase());
      if (!p || !VOTE_POSITIONS.includes(p.position as VotePosition)) continue;
      result[p.position as VotePosition].push(p);
    }
    // Sort each list by overall rating (highest first) so star players show on top
    const sortFn = (a: Account, b: Account) => {
      const ra = rankings?.get ? (rankings.get(a.username.toLowerCase())?.score || 0) : 0;
      const rb = rankings?.get ? (rankings.get(b.username.toLowerCase())?.score || 0) : 0;
      return rb - ra;
    };
    for (const position of VOTE_POSITIONS) result[position].sort(sortFn);
    return result;
  }, [period, allPlayers, account.username, rankings]);

  const { data: priorVotes, error: priorVotesError } = useResource(
    () => votingApi.listTotwVotes(period.id),
    [period.id],
  );

  useEffect(() => {
    const nextVotes = choicesFromVotes(priorVotes || [], account.username);
    setMyVotes(nextVotes);
    setSubmitted(hasCompleteVote(nextVotes));
  }, [priorVotes, account.username]);

  const pickFor = (key: VoteKey, username: string) => {
    setError(''); setInfo('');
    setSubmitted(false);
    setMyVotes(prev => ({ ...prev, [key]: username }));
  };

  const handleSubmit = async () => {
    setError(''); setInfo('');
    if (!hasCompleteVote(myVotes)) {
      setError('Pick one player for every position before submitting.');
      return;
    }
    setBusy(true);
    try {
      await votingApi.submitTotwVotes(period.id, myVotes);
      setSubmitted(true);
      setInfo('✓ Your votes are in. You can change them until voting closes.');
      onRefresh?.();
      setTimeout(() => setInfo(''), 4000);
    } catch (error_) {
      setError('Could not submit: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const closesIn = useMemo(() => {
    const ms = period.closesAt - Date.now();
    if (ms <= 0) return 'CLOSED';
    const hours = Math.floor(ms / 3_600_000);
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }, [period.closesAt]);

  const canSubmit = hasCompleteVote(myVotes);
  const rosterNeeds = VOTE_FIELDS.map(({ needed, label }) => `${needed} ${label.toLowerCase()}${needed === 1 ? '' : 's'}`).join(', ');

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* HEADER */}
      <div className="rounded-xl p-4 fade-in" style={{
        background: `linear-gradient(135deg, #2196f322 0%, ${C.white} 100%)`,
        border: `1px solid #2196f355`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={16} style={{ color: '#2196f3' }} />
          <span className="font-display text-2xl tracking-wider" style={{ color: C.brandNavy }}>VOTE TOTW</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Pick the best player at each position. The TOTW XI will have {rosterNeeds} — but you only vote for one per position. Admin picks the final winners after voting closes.
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] tracking-[0.2em] px-2 py-1 rounded" style={{ background: `#2196f322`, color: '#2196f3' }}>
            CLOSES IN {closesIn}
          </span>
          {submitted && (
            <span className="font-mono text-[10px] tracking-[0.2em] px-2 py-1 rounded" style={{ background: `${C.green}22`, color: C.green }}>
              ✓ YOUR VOTES SUBMITTED
            </span>
          )}
        </div>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}
      {error && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>
      )}
      {priorVotesError && (
        <div role="alert" className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>
          Could not load your previous votes: {priorVotesError}
        </div>
      )}

      {/* POSITION COLUMNS */}
      {VOTE_FIELDS.map(({ key, label, pos, needed }) => {
        const list = candidates[pos] || [];
        const picked = myVotes[key as keyof typeof myVotes];
        return (
          <div key={key} className="rounded-lg p-3" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="font-display text-base tracking-wider" style={{ color: C.brandNavy }}>{label}</div>
              <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.brandNavy}66` }}>
                TOTW NEEDS {needed} · YOU PICK 1
              </div>
            </div>
            {list.length === 0 ? (
              <div className="font-mono text-xs py-3 text-center" style={{ color: `${C.brandNavy}66` }}>
                NO ELIGIBLE {label}S
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {list.map(p => {
                  const isPicked = picked === p.username;
                  const ov = rankings?.get ? (rankings.get(p.username.toLowerCase())?.score || 0) : 0;
                  const s = p.stats || {};
                  return (
                    <button
                      key={p.username}
                      type="button"
                      onClick={() => pickFor(key, p.username)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors"
                      style={{
                        background: isPicked ? `#2196f322` : C.navyDeep,
                        border: `1px solid ${isPicked ? '#2196f3' : `${C.navyLight}44`}`,
                      }}
                    >
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{
                        border: `1.5px solid ${isPicked ? '#2196f3' : `${C.cream}55`}`,
                        background: isPicked ? '#2196f3' : 'transparent',
                      }}>
                        {isPicked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>{p.username}</div>
                        <div className="font-mono text-[9px]" style={{ color: `${C.cream}88` }}>
                          OVR {ov} · {s.games || 0}G · {s.goals || 0}gls · {s.assists || 0}a
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* SUBMIT */}
      <button
        onClick={handleSubmit}
        disabled={busy || !canSubmit}
        className="w-full py-3 font-display text-lg tracking-wider rounded disabled:opacity-50"
        style={{ background: '#2196f3', color: '#fff' }}
      >{busy ? 'SUBMITTING…' : (submitted ? 'UPDATE VOTES' : 'SUBMIT VOTES')}</button>
    </div>
  );
};
