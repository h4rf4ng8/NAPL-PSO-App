import { useRef, useState } from 'react';
import { Upload, CheckCircle2 } from 'lucide-react';
import { matches as matchApi } from './api';
import { parseImport, type ImportedMatch } from './import';
import type { ImportResult } from './models';
import type { Account } from '../accounts/models';
import { TeamSelect } from '../teams/TeamSelect';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { ModalShell } from '../../components/Dialog';
import { segment, ApiError } from '../../api/http';
import { sessionVersion } from '../../auth/client';
import { useLazyQuery } from '@apollo/client/react';
import { ImportAccountMatchesDocument } from '../../api/generated/graphql';

import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Command, CommandInput, CommandList, CommandItem } from '../../components/ui/command';
import { Button } from '../../components/ui/button';


// ============ IMPORT MATCH MANAGER ============
// Admin uploads a Strikers Club JSON match export. The app parses it, previews
// each player with a dropdown to confirm the ASL account, and on confirm adds
// the match to each mapped player's record.
//
// Auto-matching: if an ASL account has `strikersId` set, players in the file
// with matching player_id are auto-mapped. Otherwise admin picks manually.
// After a manual pick, that Strikers Player ID gets saved onto the ASL account
// so future imports match automatically ("teach once, applies forever").
//
// Dedup: match_id from the file is stored on each match record. Uploading the
// same file twice is a no-op (players who already have that match_id are skipped).
//
// Unmatched players are skipped and listed in the import receipt.
export const ImportMatchManager = ({ account: _account, currentSeason, onRefresh }: { account: Account; currentSeason: string; onRefresh: () => void }) => {
  const [step, setStep] = useState(1); // 1=upload, 2=teams, 3=map, 4=confirm
  const [matchData, setMatchData] = useState<ImportedMatch | null>(null); // parsed JSON
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  // For each strikers player_id → ASL username picked (or '' for skip)
  const [playerMap, setPlayerMap] = useState<Record<string,string>>({});
  // Manual tackle override — admin can type the correct value from the game
  // website since the JSON often undercounts poke_tackles_won. Key = player_id,
  // value = number string (or '' for "use auto-computed from JSON").
  const [tackleOverrides, setTackleOverrides] = useState<Record<string,string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null); // shown on success screen
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [lookupImportAccounts] = useLazyQuery(ImportAccountMatchesDocument, { fetchPolicy: 'network-only' });
  const [aslByStrikersId, setAutoMatches] = useState<Record<string,{ username: string }>>({});
  const [selectedTeams, setSelectedTeams] = useState<Record<string,string>>({});
  const [mappingPlayer, setMappingPlayer] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const accountPage = useRestPage<Pick<Account, 'id' | 'username' | 'position'>>(mappingPlayer ? `/api/accounts?search=${segment(accountSearch)}` : null, 50);

  // ---------- STEP 1: parse uploaded file ----------
  // Accepts BOTH the legacy flat Strikers Club export format and the newer
  // nested one (where per-player stats live under `stats.players` with the
  // top-level `players` holding only join/team/result info). Normalizes
  // whichever shape it sees into the flat shape the rest of the flow
  // expects so steps 2-4 don't need to change.
  const handleFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    setBusy(true);
    const version = sessionVersion();
    try {
      let text;
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // Detect UTF-16 (Strikers Club exports are often UTF-16 LE with BOM)
      if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        text = new TextDecoder('utf-16le').decode(bytes.slice(2));
      } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        text = new TextDecoder('utf-16be').decode(bytes.slice(2));
      } else if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        text = new TextDecoder('utf-8').decode(bytes.slice(3));
      } else {
        text = new TextDecoder('utf-8').decode(bytes);
      }
      const data = parseImport(text);
      setMatchData(data);
      // This explicit upload looks up only the file's player IDs, never the league population.
      const matched: [string, { username: string }][] = [];
      let after: string | null = null;
      do {
        if (version !== sessionVersion()) throw new ApiError(401, 'login_required', 'Please sign in again.');
        const result = await lookupImportAccounts({ variables: { strikersIds: data.players.map(player => String(player.player_id)), after } });
        if (version !== sessionVersion()) throw new ApiError(401, 'login_required', 'Please sign in again.');
        if (!result.data) throw new Error('Could not match uploaded players.');
        matched.push(...result.data.importAccountMatches.nodes.map(row => [row.strikersId, { username: row.username }] as [string,{ username: string }]));
        after = result.data.importAccountMatches.pageInfo.hasNextPage ? result.data.importAccountMatches.pageInfo.endCursor : null;
      } while (after);
      const byId = Object.fromEntries(matched);
      setAutoMatches(byId);
      setPlayerMap(Object.fromEntries(data.players.map(player => [player.player_id, byId[String(player.player_id)]?.username ?? ''])));
      setStep(2);
    } catch (error_) {
      setError('Could not parse file: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const refreshViews = async () => {
    setRefreshWarning('');
    setRefreshing(true);
    try { await onRefresh(); }
    catch (error_) { setRefreshWarning('Match imported successfully, but the view could not refresh: ' + (error_ instanceof Error ? error_.message : String(error_))); }
    finally { setRefreshing(false); }
  };

  // A refresh failure must never turn a completed command into an import failure.
  const commit = async () => {
    setError('');
    if (!matchData) return;
    if (!homeTeamId || !awayTeamId) { setError('Pick both home and away teams first.'); return; }
    if (homeTeamId === awayTeamId) { setError('Home and away must be different teams.'); return; }
    setBusy(true);
    try {
      const result = await matchApi.importMatch({ matchData, playerMap, tackleOverrides, homeTeamId, awayTeamId, season: currentSeason });
      setImportResult(result);
      setStep(5);
    } catch (error_) {
      setError('Import failed: ' + (error_ instanceof Error ? error_.message : String(error_)));
      setBusy(false);
      return;
    }
    setBusy(false);
    await refreshViews();
  };

  // Reset for another import
  const startOver = () => {
    setStep(1);
    setMatchData(null);
    setHomeTeamId('');
    setAwayTeamId('');
    setPlayerMap({});
    setImportResult(null);
    setError('');
    setTackleOverrides({});
    setAutoMatches({});
    setSelectedTeams({});
    setMappingPlayer(null);
    setAccountSearch('');
    setRefreshWarning('');
  };

  const matchedCount = Object.values(playerMap).filter(Boolean).length;
  const skippedCount = Object.values(playerMap).filter(v => !v).length;

  return (
    <div className="space-y-5">
      <div><h2 className="text-xl font-semibold">Import a match</h2><p className="mt-1 text-sm text-muted-foreground">Upload an export, assign teams, and review player records before saving.</p></div>
      <ol aria-label="Import progress" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{['Upload', 'Teams', 'Players', 'Confirm'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${step === index + 1 ? 'border-primary bg-accent font-medium' : 'text-muted-foreground'}`}><Badge variant={step > index + 1 ? 'default' : 'secondary'}>{step > index + 1 ? '✓' : index + 1}</Badge>{label}</li>)}</ol>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {step === 1 && <Card className="border-dashed"><CardContent className="flex flex-col items-center gap-3 p-8 text-center"><Upload className="size-9 text-muted-foreground" aria-hidden="true" /><h3 className="text-lg font-medium">Upload a Strikers Club match file</h3><p className="text-sm text-muted-foreground">JSON export in UTF-8 or UTF-16.</p><Input ref={fileInputRef} aria-label="Match JSON file" type="file" accept=".json,application/json" onChange={e => { void handleFile(e.target.files?.[0]); }} className="hidden" /><Button disabled={busy} onClick={() => fileInputRef.current?.click()}>{busy ? 'Parsing…' : 'Choose file'}</Button></CardContent></Card>}
      {step === 2 && matchData && <>
        <Card><CardHeader><CardTitle>Match info from file</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Match ID</dt><dd className="break-all font-mono text-sm">{matchData.match_id}</dd></div><div><dt className="text-xs text-muted-foreground">Stadium</dt><dd>{matchData.stadium || '—'}</dd></div><div><dt className="text-xs text-muted-foreground">Length</dt><dd>{Math.floor((matchData.match_length || 0) / 60)}:00</dd></div><div><dt className="text-xs text-muted-foreground">Score</dt><dd className="font-semibold">{matchData.score?.home ?? 0} – {matchData.score?.away ?? 0}</dd></div></dl></CardContent></Card>
        <Card><CardHeader><CardTitle>Assign ASL teams</CardTitle><CardDescription>Choose the league team for each side of this match.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Home · {matchData.score?.home ?? 0} goals{selectedTeams[homeTeamId] && ` · ${selectedTeams[homeTeamId]}`}</Label><TeamSelect value={homeTeamId} onChange={setHomeTeamId} label="Home import team" onSelected={team => setSelectedTeams(previous => ({ ...previous, [team.id]: team.name }))} /></div><div className="space-y-2"><Label>Away · {matchData.score?.away ?? 0} goals{selectedTeams[awayTeamId] && ` · ${selectedTeams[awayTeamId]}`}</Label><TeamSelect value={awayTeamId} onChange={setAwayTeamId} label="Away import team" onSelected={team => setSelectedTeams(previous => ({ ...previous, [team.id]: team.name }))} /></div></CardContent></Card>
        {homeTeamId && homeTeamId === awayTeamId && <Alert variant="destructive"><AlertDescription>Home and away must be different teams.</AlertDescription></Alert>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={startOver}>Back</Button><Button onClick={() => setStep(3)} disabled={!homeTeamId || !awayTeamId || homeTeamId === awayTeamId}>Next: map players</Button></div>
      </>}
      {step === 3 && matchData && <>
        <Card><CardHeader><CardTitle>Map players to ASL accounts</CardTitle><CardDescription>Linked Strikers IDs match automatically. Choose an account for unmatched players or leave them skipped.</CardDescription></CardHeader><CardContent className="space-y-4">
          <Alert><AlertTitle>Tackle corrections</AlertTitle><AlertDescription>Exports may undercount tackles. Check the game website and enter a correction if needed. Leave blank to use poke tackles won + slide tackles won.</AlertDescription></Alert>
          <div className="space-y-3">{matchData.players.map(p => {
            const currentPick = playerMap[p.player_id] || '';
            const autoMatched = aslByStrikersId[String(p.player_id)];
            const isAuto = autoMatched && currentPick === autoMatched.username;
            const stats = p.stats || {};
            const autoTkl = (stats.poke_tackles_won || 0) + (stats.slide_tackles_won || 0);
            const overrideVal = tackleOverrides[p.player_id];
            const effectiveTkl = overrideVal === undefined || overrideVal === '' ? autoTkl : Number(overrideVal) || 0;
            const summary = [stats.goals ? `${stats.goals} goals` : null, stats.assists ? `${stats.assists} assists` : null, stats.passes ? `${stats.passes} passes` : null, effectiveTkl > 0 ? `${effectiveTkl} tackles` : null, stats.deflects ? `${stats.deflects} deflects` : null, stats.catches ? `${stats.catches} catches` : null].filter(Boolean).join(' · ') || 'No stats';
            return <div key={p.player_id} className="rounded-lg border p-4 space-y-3"><div className="flex flex-wrap items-start gap-2"><div className="min-w-0 flex-1"><p className="break-words font-medium">{p.username}</p><p className="break-all text-xs text-muted-foreground">ID: {p.player_id}</p></div><Badge variant="outline">{p.team === 'home' ? 'Home' : 'Away'}</Badge><Badge variant={currentPick ? 'secondary' : 'outline'}>{isAuto ? 'Auto matched' : (currentPick ? 'Mapped' : 'Skipped')}</Badge></div><p className="text-xs text-muted-foreground">{summary}</p><div className="flex flex-wrap items-end gap-3"><Button className="max-w-full justify-start overflow-hidden" variant="outline" onClick={() => { setMappingPlayer(String(p.player_id)); setAccountSearch(''); }} aria-label={`Map ${p.username} to ASL account`}><span className="truncate">{currentPick || 'Choose ASL account or skip'}</span></Button><div className="space-y-1"><Label htmlFor={`tackles-${p.player_id}`} className="text-xs">Tackles for {p.username}</Label><Input id={`tackles-${p.player_id}`} className="w-24" type="number" min="0" value={overrideVal ?? ''} placeholder={String(autoTkl)} onChange={e => setTackleOverrides(prev => ({ ...prev, [p.player_id]: e.target.value }))} /></div></div></div>;
          })}</div><p className="text-sm text-muted-foreground">{matchedCount} matched · {skippedCount} will be skipped</p>
        </CardContent></Card>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button onClick={() => setStep(4)}>Next: confirm</Button></div>
      </>}
      {step === 4 && matchData && <>
        <Card><CardHeader><CardTitle>Review & confirm</CardTitle><CardDescription>Confirm the match and player mappings before importing.</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-lg font-medium">{selectedTeams[homeTeamId]} <span className="tabular-nums">{matchData.score?.home ?? 0} – {matchData.score?.away ?? 0}</span> {selectedTeams[awayTeamId]}</p><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Season</dt><dd>{currentSeason}</dd></div><div><dt className="text-xs text-muted-foreground">Stadium</dt><dd>{matchData.stadium || '—'}</dd></div><div><dt className="text-xs text-muted-foreground">Will update</dt><dd>{matchedCount} players</dd></div><div><dt className="text-xs text-muted-foreground">Will skip</dt><dd>{skippedCount} players without a mapped account</dd></div></dl><p className="text-sm text-muted-foreground">Stats are added to each mapped player’s record. Players who already have this match will not receive duplicate records.</p></CardContent></Card>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setStep(3)} disabled={busy}>Back</Button><Button onClick={commit} disabled={busy}>{busy ? 'Importing…' : `Confirm import (${matchedCount} players)`}</Button></div>
      </>}
      {step === 5 && importResult && <Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" /> Import complete</CardTitle><CardDescription className="break-all">Match ID: {importResult.matchId}</CardDescription></CardHeader><CardContent className="space-y-4"><p className="font-medium">{importResult.homeTeam} {importResult.score} {importResult.awayTeam}</p><dl className="grid grid-cols-3 gap-3">{[['Updated', importResult.updated], ['Already imported', importResult.alreadyImported], ['Skipped', importResult.skipped]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
        {importResult.skippedIndexes.length > 0 && <div className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-medium">Skipped players · no mapped ASL account</h3><ul className="space-y-1 text-sm text-muted-foreground">{importResult.skippedIndexes.map(index => { const skipped = matchData?.players[index]; return skipped ? <li key={index} className="break-words">{skipped.username} (ID {skipped.player_id})</li> : null; })}</ul></div>}
        {refreshWarning && <Alert><AlertDescription>{refreshWarning}<Button className="mt-2" variant="outline" disabled={refreshing} onClick={() => { void refreshViews(); }}>{refreshing ? 'Refreshing…' : 'Retry refresh'}</Button></AlertDescription></Alert>}
        <Button onClick={startOver} disabled={refreshing}>Import another match</Button>
      </CardContent></Card>}
      {mappingPlayer && <ModalShell title="Map ASL account" onClose={() => setMappingPlayer(null)}><Command shouldFilter={false}><CommandInput aria-label="Search mapping accounts" placeholder="Search accounts" value={accountSearch} onValueChange={setAccountSearch} /><CommandList><CommandItem onSelect={() => { setPlayerMap(previous => ({ ...previous, [mappingPlayer]: '' })); setMappingPlayer(null); }}>Skip this player</CommandItem>{accountPage.loading && <p role="status" className="p-3 text-sm text-muted-foreground">Loading accounts…</p>}{accountPage.data?.nodes.map(player => <CommandItem key={player.id} value={player.id} onSelect={() => { setPlayerMap(previous => ({ ...previous, [mappingPlayer]: player.username })); setMappingPlayer(null); }}>{player.username} · {player.position}</CommandItem>)}{!accountPage.loading && !accountPage.error && accountPage.data?.nodes.length === 0 && <p className="p-3 text-sm text-muted-foreground">No accounts found.</p>}</CommandList></Command>{accountPage.error && <Alert variant="destructive"><AlertDescription>{accountPage.error}<Button variant="outline" onClick={accountPage.restart}>Restart accounts</Button></AlertDescription></Alert>}<PageButtons {...accountPage} hasNextPage={accountPage.data?.pageInfo.hasNextPage ?? false} /></ModalShell>}
    </div>
  );
};
