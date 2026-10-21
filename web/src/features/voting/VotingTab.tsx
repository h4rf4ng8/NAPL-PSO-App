import { Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { VOTE_FIELDS, type VoteKey, type VotePosition } from '@napl/contracts/league';
import { voting as votingApi } from './api';
import type { Account } from '../accounts/models';
import type { VotingPeriod } from './models';
import { C } from '../../theme/theme';
import { useQuery } from '@apollo/client/react';
import { VotingCandidatesDocument } from '../../api/generated/graphql';
import { accountStatsSchema } from '@napl/contracts/accounts';
import { useResource } from '../../hooks/use-resource';
import { choicesFromVotes, emptyVoteChoices, hasCompleteVote } from './voting-utils';

// ============ DASHBOARD ============
// ============ VOTING TAB (player-facing) ============
// Shown only when there's an open voting period. Players pick 1 player per
// configured vote position from the eligible pool, then submit. Once
// submitted, the tab shows what they voted for and lets them change votes
// until the period closes.
export const VotingTab = ({ account, period }: { account: Account; period: Pick<VotingPeriod, 'id' | 'closesAt' | 'status'> }) => {
  const [myVotes, setMyVotes] = useState(emptyVoteChoices);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const { data: priorVotes, error: priorVotesError } = useResource(
    () => votingApi.myTotwVotes(period.id),
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
        const picked = myVotes[key as keyof typeof myVotes];
        return <CandidatePosition key={key} periodId={period.id} position={pos} label={label} needed={needed} picked={picked} onPick={username => pickFor(key, username)} />;
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

function CandidatePosition({ periodId, position, label, needed, picked, onPick }: { periodId: string; position: VotePosition; label: string; needed: number; picked: string; onPick: (username: string) => void }) {
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const { data, loading, error, refetch } = useQuery(VotingCandidatesDocument, { variables: { periodId, position, after } });
  return <section className="rounded-lg p-3 space-y-2" style={{ background: C.white }}>
    <h3>{label} · TOTW needs {needed} · You pick 1</h3>
    {picked && <p>Your selection: {picked}</p>}
    {loading && <p role="status">Loading candidates…</p>}
    {error && <p role="alert">{error.message} <button onClick={() => { setAfter(null); setPrevious([]); void refetch({ after: null }).catch(() => {}); }}>Restart candidates</button></p>}
    {(data?.votingCandidates.nodes ?? []).map(player => {
      const stats = accountStatsSchema.parse(player.stats);
      return <button key={player.id} type="button" aria-pressed={picked === player.username} onClick={() => onPick(player.username)} className="block w-full text-left p-2 border rounded">
        {player.username} · OVR {player.ranking.score} · {stats.games}G · {stats.goals} goals · {stats.assists} assists
      </button>;
    })}
    {data?.votingCandidates.totalCount === 0 && <p>No eligible {label}s</p>}
    <div className="flex gap-3">
      <button disabled={loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous {label}s</button>
      <button disabled={loading || !data?.votingCandidates.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.votingCandidates.pageInfo.endCursor ?? null); }}>Next {label}s</button>
    </div>
  </section>;
}
