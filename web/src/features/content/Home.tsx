import { auth } from '../../auth/session';
import { ASL_LOGO_DIAMOND } from '../../assets/asl-logos';
import { Flag, User } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { accounts as accountApi } from '../accounts/api';
import type { Account } from '../accounts/models';
import { useQuery } from '@apollo/client/react';
import { HomeSummaryDocument, HomeNewsDocument } from '../../api/generated/graphql';
import { z } from 'zod';
import { newsSummarySchema } from './models';
import { LazyText } from './LazyText';
import { readText } from '../../api/page';
import { segment } from '../../api/http';
import { mediaUrl } from '../../components/MediaImage';
import type { TeamSummary as Team } from '../teams/models';
import { QuickStat, ResultRow, Section } from '../../components/Display';
import { COUNTRIES, flagUrl } from '../../utils/league';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

const homeSummarySchema = z.object({ playerCount: z.number(), activeTeamCount: z.number(), topPlayers: z.array(z.object({
  id: z.string(), username: z.string(), position: z.string(), ranking: z.object({ score: z.number() }), stats: z.object({ games: z.number() }),
})) });

export const HomeView = ({ account, allTeams, currentSeason, onJump, onUpdate }: { account: Account; allTeams: Team[]; currentSeason: string | undefined; onJump: (view: string) => void; onUpdate: (account: Account) => void }) => {
  const [editingCountry, setEditingCountry] = useState(false);
  const [countryInput, setCountryInput] = useState('');
  const [countryBusy, setCountryBusy] = useState(false);
  const [countryMsg, setCountryMsg] = useState('');
  const [editingLinks, setEditingLinks] = useState(false);
  const [strikersIdInput, setStrikersIdInput] = useState(account.strikersId || '');
  const [steamUrlInput, setSteamUrlInput] = useState('');
  const [linksBusy, setLinksBusy] = useState(false);
  const [linksMsg, setLinksMsg] = useState('');
  const [receipt, setReceipt] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const refreshProfile = async () => {
    setRefreshError('');
    try { const updated = await auth.getCurrent(); if (updated) onUpdate(updated); }
    catch (error) { setRefreshError('Your changes were saved, but the profile could not refresh: ' + (error instanceof Error ? error.message : String(error))); }
  };
  const handleSaveLinks = async () => {
    if (linksBusy) return;
    setLinksMsg('');
    const sid = strikersIdInput.trim(); const surl = steamUrlInput.trim();
    const finalStrikersId = account.strikersId ?? (sid || null);
    if (sid && !account.strikersId && !/^\d{2,15}$/.test(sid)) { setLinksMsg('Strikers Club Player ID should be a number (2–15 digits).'); return; }
    if (surl && !/^https?:\/\/(www\.)?steamcommunity\.com\//i.test(surl)) { setLinksMsg('Steam URL should start with https://steamcommunity.com/'); return; }
    setLinksBusy(true);
    try { await accountApi.patchAccount(account.id, { strikersId: finalStrikersId, steamUrl: surl || null }); }
    catch (error) { setLinksMsg('Could not save: ' + (error instanceof Error ? error.message : String(error))); setLinksBusy(false); return; }
    setEditingLinks(false); setReceipt('Linked accounts saved.'); toast.success('Linked accounts saved.');
    await refreshProfile(); setLinksBusy(false);
  };
  const handleSaveCountry = async () => {
    if (countryBusy) return;
    setCountryMsg('');
    if (!countryInput) { setCountryMsg('Please pick a country.'); return; }
    setCountryBusy(true);
    try { await accountApi.patchAccount(account.id, { country: countryInput }); }
    catch (error) { setCountryMsg('Could not save country: ' + (error instanceof Error ? error.message : String(error))); setCountryBusy(false); return; }
    setEditingCountry(false); setReceipt('Country saved.'); toast.success('Country saved.');
    await refreshProfile(); setCountryBusy(false);
  };
  const summary = useQuery(HomeSummaryDocument);
  const announcementQuery = useQuery(HomeNewsDocument, { variables: { kind: 'announcement', first: 3, after: null } });
  const upcomingQuery = useQuery(HomeNewsDocument, { variables: { kind: 'matchup', first: 3, after: null, upcomingOnly: true } });
  const resultQuery = useQuery(HomeNewsDocument, { variables: { kind: 'result', first: 3, after: null } });
  const overview = summary.data ? homeSummarySchema.parse(summary.data.homeSummary) : null;
  const announcements = (announcementQuery.data?.homeNews.nodes ?? []).map(row => newsSummarySchema.parse(row));
  const upcoming = (upcomingQuery.data?.homeNews.nodes ?? []).map(row => newsSummarySchema.parse(row));
  const results = (resultQuery.data?.homeNews.nodes ?? []).map(row => newsSummarySchema.parse(row));
  const teamById = (id: string | null | undefined) => allTeams.find(team => team.id === id);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-6 border-b border-primary/20 pb-8 pt-2">
      <div className="min-w-0 flex-1"><div className="flex items-end gap-4"><p className="font-display text-7xl leading-none text-primary sm:text-8xl">ASL</p><p className="max-w-36 pb-1 text-lg font-semibold uppercase leading-tight">Alliance<br />Strikers League</p></div><h2 className="mt-5 break-words text-2xl font-semibold">Welcome back, {account.username}</h2><p className="mt-1 max-w-2xl text-muted-foreground">{currentSeason ? `Season ${currentSeason}. ` : ''}Your player, your team, your league.</p><div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => onJump('me')}><User className="mr-2 size-4" />My player card</Button><Button variant="outline" onClick={() => onJump('news')}><Flag className="mr-2 size-4" />Latest news</Button></div></div>
      <img src={ASL_LOGO_DIAMOND} alt="" className="hidden w-32 shrink-0 object-contain sm:block xl:w-40" />
    </header>
    {summary.error && <Alert variant="destructive"><AlertDescription>League metrics are unavailable: {summary.error.message} <Button variant="outline" onClick={() => { void summary.refetch().catch(() => {}); }}>Try again</Button></AlertDescription></Alert>}
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><QuickStat label="Your tier" value={account.ranking.ranked ? account.ranking.tier : 'Unranked'} /><QuickStat label="Games played" value={account.stats.games} /><QuickStat label="League players" value={summary.error ? 'Unavailable' : overview?.playerCount ?? '…'} /><QuickStat label="Active teams" value={summary.error ? 'Unavailable' : overview?.activeTeamCount ?? '…'} /></div>
    <Card><CardHeader><CardTitle>My profile</CardTitle><CardDescription>Your email is private. Discord manages your username and email.</CardDescription></CardHeader><CardContent className="space-y-4">
      {receipt && <p role="status" className="text-sm text-success">{receipt}</p>}
      {refreshError && <Alert variant="destructive"><AlertDescription>{refreshError} <Button variant="outline" onClick={() => { void refreshProfile(); }}>Refresh profile</Button></AlertDescription></Alert>}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="min-w-0 space-y-4"><div><p className="text-sm font-medium">Email</p><p className="break-words text-muted-foreground">{account.email || 'Managed through Discord'}</p></div>
          <div className="space-y-2"><Label htmlFor="profile-country">Country</Label>{editingCountry ? <><Select value={countryInput} onValueChange={setCountryInput} disabled={countryBusy}><SelectTrigger id="profile-country"><SelectValue placeholder="Choose your country" /></SelectTrigger><SelectContent>{COUNTRIES.map(country => <SelectItem key={country} value={country}>{country}</SelectItem>)}</SelectContent></Select><div className="flex gap-2"><Button onClick={() => { void handleSaveCountry(); }} disabled={countryBusy}>{countryBusy ? 'Saving…' : 'Save country'}</Button><Button variant="outline" disabled={countryBusy} onClick={() => { setEditingCountry(false); setCountryMsg(''); }}>Cancel</Button></div></> : <div className="flex flex-wrap items-center gap-2">{account.country && flagUrl(account.country) && <img src={flagUrl(account.country)!} alt="" className="h-4 w-6 rounded-sm object-cover" />}<span>{account.country || 'Not set'}</span><Button variant="outline" onClick={() => { setEditingCountry(true); setCountryInput(account.country || ''); }}>Change country</Button></div>}{countryMsg && <Alert variant="destructive"><AlertDescription>{countryMsg}</AlertDescription></Alert>}</div>
        </div>
        <div className="min-w-0 space-y-3"><h3 className="font-semibold">Linked accounts</h3>{editingLinks ? <>
          <div className="space-y-2"><Label htmlFor="profile-strikers">Strikers Club Player ID</Label><Input id="profile-strikers" value={account.strikersId || strikersIdInput} disabled={!!account.strikersId || linksBusy} inputMode="numeric" onChange={event => setStrikersIdInput(event.target.value.replaceAll(/\D/g, ''))} aria-describedby="strikers-help" /><p id="strikers-help" className="text-sm text-muted-foreground">{account.strikersId ? 'Only an administrator can change this ID. Contact staff if it is incorrect.' : 'Required to join a team. Find the 2–15 digit ID on your in-game profile. Once saved, only an administrator can change it.'}</p></div>
          <div className="space-y-2"><Label htmlFor="profile-steam">Steam profile URL (optional)</Label><Input id="profile-steam" type="url" value={steamUrlInput} disabled={linksBusy} onChange={event => setSteamUrlInput(event.target.value)} placeholder="https://steamcommunity.com/id/…" /></div>
          <div className="flex flex-wrap gap-2"><Button onClick={() => { void handleSaveLinks(); }} disabled={linksBusy}>{linksBusy ? 'Saving…' : 'Save linked accounts'}</Button><Button variant="outline" disabled={linksBusy} onClick={() => { setEditingLinks(false); setLinksMsg(''); }}>Cancel</Button></div>
        </> : <><p className="flex flex-wrap items-center gap-2 text-sm">Strikers Club ID: <span className="tabular-nums">{account.strikersId || 'Not set'}</span>{account.strikersId && <Badge variant="secondary">Locked</Badge>}</p><p className="text-sm">Steam: {account.steamUrl ? <a href={mediaUrl(account.steamUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline">Steam profile</a> : 'Not set'}</p><Button variant="outline" disabled={linksBusy} onClick={() => {
          setLinksBusy(true); setLinksMsg('');
          void readText(`/api/accounts/${segment(account.id)}/links/steamUrl`).then(value => { setStrikersIdInput(account.strikersId || ''); setSteamUrlInput(value); setEditingLinks(true); }).catch((error: unknown) => { setLinksMsg(error instanceof Error ? error.message : 'Could not load linked accounts.'); }).finally(() => setLinksBusy(false));
        }}>{linksBusy ? 'Loading…' : 'Edit linked accounts'}</Button></>}{linksMsg && <Alert variant="destructive"><AlertDescription>{linksMsg}</AlertDescription></Alert>}</div>
      </div>
    </CardContent></Card>
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Section title="Latest from the league" onMore={() => onJump('news')}>
        {announcementQuery.loading && <Skeleton className="h-24" aria-label="Loading announcements" />}
        {announcementQuery.error && <Alert variant="destructive"><AlertDescription>{announcementQuery.error.message} <Button variant="outline" onClick={() => { void announcementQuery.refetch().catch(() => {}); }}>Retry announcements</Button></AlertDescription></Alert>}
        {!announcementQuery.loading && !announcementQuery.error && announcements.length === 0 && <p className="text-muted-foreground">No announcements yet.</p>}
        <div className="space-y-4">{announcements.map(item => <div key={item.id}><h3 className="break-words font-semibold">{item.title}</h3><LazyText url={item.bodyUrl} label="Read announcement" /></div>)}</div>
      </Section>
      <Section title="Recent results" onMore={() => onJump('news')}>
        {resultQuery.loading && <Skeleton className="h-24" aria-label="Loading results" />}
        {resultQuery.error && <Alert variant="destructive"><AlertDescription>{resultQuery.error.message} <Button variant="outline" onClick={() => { void resultQuery.refetch().catch(() => {}); }}>Retry results</Button></AlertDescription></Alert>}
        {!resultQuery.loading && !resultQuery.error && results.length === 0 && <p className="text-muted-foreground">No results yet.</p>}
        <div className="space-y-3">{results.map(item => <ResultRow key={item.id} r={item} home={item.homeTeam ?? teamById(item.homeTeamId)} away={item.awayTeam ?? teamById(item.awayTeamId)} />)}</div>
      </Section>
      <Section title="Upcoming fixtures" onMore={() => onJump('schedule')}>
        {upcomingQuery.loading && <Skeleton className="h-24" aria-label="Loading fixtures" />}
        {upcomingQuery.error && <Alert variant="destructive"><AlertDescription>{upcomingQuery.error.message} <Button variant="outline" onClick={() => { void upcomingQuery.refetch().catch(() => {}); }}>Retry fixtures</Button></AlertDescription></Alert>}
        {!upcomingQuery.loading && !upcomingQuery.error && upcoming.length === 0 && <p className="text-muted-foreground">No upcoming fixtures.</p>}
        <div className="space-y-3">{upcoming.map(item => <div key={item.id} className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">{item.date ? new Date(item.date).toLocaleString() : 'Date to be confirmed'}</p><p className="break-words font-medium">{(item.homeTeam ?? teamById(item.homeTeamId))?.name || 'TBD'} <span className="text-muted-foreground">vs</span> {(item.awayTeam ?? teamById(item.awayTeamId))?.name || 'TBD'}</p></div>)}</div>
      </Section>
      <Section title="Top ranked players" onMore={() => onJump('leaderboard')}>
        {summary.loading && <Skeleton className="h-24" aria-label="Loading ranked players" />}
        {summary.error && <p role="alert">Ranked players are unavailable.</p>}
        {!summary.loading && !summary.error && overview?.topPlayers.length === 0 && <p className="text-muted-foreground">No ranked players yet.</p>}
        <ol className="space-y-3">{overview?.topPlayers.map((player, index) => <li key={player.id} className="flex items-center gap-3 rounded-lg border p-3"><span className="text-lg font-semibold tabular-nums text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><p className="break-words font-medium">{player.username}</p><p className="text-sm text-muted-foreground">{player.position} · {player.stats.games} games</p></div><span className="text-xl font-semibold tabular-nums">{player.ranking.score}</span></li>)}</ol>
      </Section>
    </div>
  </div>;
};
