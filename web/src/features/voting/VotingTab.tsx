import { Trophy } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { VOTE_FIELDS, type VoteKey, type VotePosition } from '@napl/contracts/league';
import { accountStatsSchema } from '@napl/contracts/accounts';
import { useQuery } from '@apollo/client/react';
import { VotingCandidatesDocument } from '../../api/generated/graphql';
import { useResource } from '../../hooks/use-resource';
import type { Account } from '../accounts/models';
import type { VotingPeriod } from './models';
import { voting as votingApi } from './api';
import { choicesFromVotes, emptyVoteChoices, hasCompleteVote } from './voting-utils';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';

type VotingProps = { account: Account; period: Pick<VotingPeriod, 'id' | 'closesAt' | 'status'> };

// A new period or account starts a new ballot and resets all candidate cursors.
export const VotingTab = ({ account, period }: VotingProps) =>
  <VotingBallot key={`${account.id}:${period.id}`} account={account} period={period} />;

function VotingBallot({ account, period }: VotingProps) {
  const [myVotes, setMyVotes] = useState(emptyVoteChoices);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [now, setNow] = useState(Date.now);
  const prior = useResource(() => votingApi.myTotwVotes(period.id), [period.id, account.id]);

  useEffect(() => {
    const nextVotes = choicesFromVotes(prior.data || [], account.username);
    setMyVotes(nextVotes);
    setSubmitted(hasCompleteVote(nextVotes));
  }, [prior.data, account.username]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const closed = period.status !== 'open' || now >= period.closesAt;
  const pickFor = (key: VoteKey, username: string) => {
    setError('');
    setInfo('');
    setSubmitted(false);
    setMyVotes(previous => ({ ...previous, [key]: username }));
  };

  const handleSubmit = async () => {
    setError('');
    setInfo('');
    if (period.status !== 'open' || Date.now() >= period.closesAt) {
      setNow(Date.now());
      setError('Voting has closed. Your selections have not been submitted.');
      return;
    }
    if (!hasCompleteVote(myVotes)) {
      setError('Pick one player for every position before submitting.');
      return;
    }
    setBusy(true);
    try {
      await votingApi.submitTotwVotes(period.id, myVotes);
      setSubmitted(true);
      setInfo('Your votes are saved. You can change them until voting closes.');
    } catch (error_) {
      setError('Could not submit: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const selectedCount = VOTE_FIELDS.filter(({ key }) => myVotes[key]).length;
  const rosterNeeds = VOTE_FIELDS.map(({ needed, label }) => `${needed} ${label.toLowerCase()}${needed === 1 ? '' : 's'}`).join(', ');
  const disabled = busy || closed || prior.loading || !!prior.error;
  let submitLabel = submitted ? 'Update votes' : 'Submit votes';
  if (closed) submitLabel = 'Voting closed';
  if (busy) submitLabel = 'Submitting…';

  return <div className="mx-auto max-w-4xl space-y-5">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="size-5" aria-hidden="true" /> Team of the Week voting</CardTitle>
        <CardDescription>Choose one player at each position. The final team needs {rosterNeeds}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Badge variant={closed ? 'secondary' : 'outline'}>{closed ? 'Voting closed' : `Closes ${new Date(period.closesAt).toLocaleString()}`}</Badge>
        <Badge variant="secondary">{selectedCount} of {VOTE_FIELDS.length} positions selected</Badge>
        {submitted && <Badge>Votes submitted</Badge>}
      </CardContent>
    </Card>
    {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {prior.loading && <p role="status" className="text-sm text-muted-foreground">Loading your previous votes…</p>}
    {prior.error && <Alert variant="destructive"><AlertDescription>Could not load your previous votes: {prior.error}<Button className="mt-2" variant="outline" onClick={() => { void prior.reload(); }}>Retry previous votes</Button></AlertDescription></Alert>}
    {VOTE_FIELDS.map(({ key, label, pos, needed }) => <CandidatePosition
      key={key} periodId={period.id} position={pos} label={label} needed={needed}
      picked={myVotes[key]} disabled={disabled} onPick={username => pickFor(key, username)}
    />)}
    <div className="sticky bottom-3 rounded-xl border bg-card p-3 shadow-lg">
      <Button className="w-full" onClick={handleSubmit} disabled={disabled || !hasCompleteVote(myVotes)}>
        {submitLabel}
      </Button>
      {!hasCompleteVote(myVotes) && !closed && <p className="mt-2 text-center text-xs text-muted-foreground">Choose one player in each of the {VOTE_FIELDS.length} positions to submit.</p>}
    </div>
  </div>;
}

function CandidatePosition({ periodId, position, label, needed, picked, disabled, onPick }: {
  periodId: string; position: VotePosition; label: string; needed: number; picked: string; disabled: boolean; onPick: (username: string) => void;
}) {
  const id = useId();
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const { data, loading, error, refetch } = useQuery(VotingCandidatesDocument, { variables: { periodId, position, after } });
  const title = label.charAt(0) + label.slice(1).toLowerCase();

  return <Card>
    <CardHeader className="pb-3">
      <CardTitle id={id} className="text-base">{title}</CardTitle>
      <CardDescription>The final team needs {needed}. You choose one.</CardDescription>
      {picked && <p className="break-words text-sm font-medium">Your selection: {picked}</p>}
    </CardHeader>
    <CardContent className="space-y-3">
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading candidates…</p>}
      {error && <Alert variant="destructive"><AlertDescription>{error.message}<Button variant="outline" onClick={() => { setAfter(null); setPrevious([]); void refetch({ after: null }).catch(() => {}); }}>Restart candidates</Button></AlertDescription></Alert>}
      <RadioGroup aria-labelledby={id} value={picked} onValueChange={onPick} disabled={disabled || loading || !!error} className="grid gap-2 sm:grid-cols-2">
        {(data?.votingCandidates.nodes ?? []).map(player => {
          const stats = accountStatsSchema.parse(player.stats);
          return <Label key={player.id} htmlFor={`${id}-${player.id}`} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${picked === player.username ? 'border-primary bg-accent' : 'hover:bg-muted'}`}>
            <RadioGroupItem id={`${id}-${player.id}`} value={player.username} className="mt-0.5" />
            <span className="min-w-0 space-y-1"><span className="block break-words font-medium">{player.username}</span><span className="block text-xs font-normal text-muted-foreground">OVR {player.ranking.score} · {stats.games} games · {stats.goals} goals · {stats.assists} assists</span></span>
          </Label>;
        })}
      </RadioGroup>
      {!loading && !error && data?.votingCandidates.totalCount === 0 && <p className="text-sm text-muted-foreground">No eligible {title.toLowerCase()}s.</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" disabled={loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous {title.toLowerCase()}s</Button>
        <Button variant="outline" disabled={loading || !data?.votingCandidates.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.votingCandidates.pageInfo.endCursor ?? null); }}>Next {title.toLowerCase()}s</Button>
      </div>
    </CardContent>
  </Card>;
}
