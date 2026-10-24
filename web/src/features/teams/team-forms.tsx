import { uploadImage } from '../../api/media';
import { MediaImage, mediaUrl } from '../../components/MediaImage';
import { Clock, Shield, X } from 'lucide-react';
import { useId, useState } from 'react';
import { teams as teamApi } from './api';
import type { Account } from '../accounts/models';
import type { Team } from './models';

import { ModalShell } from '../../components/Dialog';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { segment } from '../../api/http';

import { compressImage } from '../../utils/input';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Separator } from '../../components/ui/separator';


// ============ SUBMIT TEAM MODAL ============
// ============ EDIT TEAM MODAL (admin) ============
// Admins can edit any approved team's visual properties — logo, name, tag,
// color, description. Member roster stays managed via the PLAYERS section.
export const EditTeamModal = ({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: () => void }) => {
  const fieldId = useId();
  const [name, setName] = useState(team.name || '');
  const [tag, setTag] = useState(team.tag || '');
  const [color, setColor] = useState(team.color || '#2d7a4a');
  const [description, setDescription] = useState(team.description || '');
  const [logoUrl, setLogoUrl] = useState(team.logoUrl || null);
  const [seasons, setSeasons] = useState(Array.isArray(team.seasons) ? team.seasons : []);
  const [newSeason, setNewSeason] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleSeason = (s: string) => {
    const key = s.toUpperCase();
    if (!key) return;
    setSeasons(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key].sort((a,b)=>a.localeCompare(b)));
  };
  const addNewSeason = () => {
    const key = (newSeason || '').trim().toUpperCase();
    if (!key) return;
    if (!seasons.includes(key)) setSeasons(prev => [...prev, key].sort((a,b)=>a.localeCompare(b)));
    setNewSeason('');
  };

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Team logo must be an image file'); return; }
    setError('');
    setLogoBusy(true);
    try {
      const dataUrl = await compressImage(file, 300, 0.85);
      setLogoUrl(dataUrl);
    } catch (error_) {
      setError('Could not process logo: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setLogoBusy(false);
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim() || name.length < 3) { setError('Team name must be 3+ characters'); return; }
    if (!tag.trim() || tag.length < 2 || tag.length > 5) { setError('Tag must be 2-5 characters'); return; }
    if (!logoUrl) { setError('Team must have a logo'); return; }
    setLoading(true);
    try {
      await teamApi.saveTeam({
        id: team.id,
        name: name.trim(),
        tag: tag.trim().toUpperCase(),
        color,
        description: description.trim(),
        ...(logoUrl !== team.logoUrl && { logoUrl: await uploadImage('team-logo', team.id, logoUrl) }),
        seasons,
      });
      onSaved?.();
    } catch (error_) {
      setError('Could not save: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setLoading(false);
  };

  return <ModalShell onClose={onClose} title="Edit team" maxWidth="max-w-xl">
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Update this team’s identity and season exclusions. Manage roster membership in Players.</p>
      <div className="space-y-2"><Label htmlFor={`${fieldId}-name`}>Team name</Label><Input id={`${fieldId}-name`} value={name} onChange={event => setName(event.target.value)} maxLength={28} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label htmlFor={`${fieldId}-tag`}>Tag (2–5 characters)</Label><Input id={`${fieldId}-tag`} value={tag} onChange={event => setTag(event.target.value.toUpperCase())} maxLength={5} /></div>
        <div className="space-y-2"><Label htmlFor={`${fieldId}-color`}>Team color</Label><Input id={`${fieldId}-color`} type="color" value={color} onChange={event => setColor(event.target.value)} className="p-1" /></div>
      </div>
      <div className="space-y-2"><Label htmlFor={`${fieldId}-description`}>Description <span className="text-muted-foreground">(optional)</span></Label><Textarea id={`${fieldId}-description`} value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={200} /></div>
      <Separator />
      <section className="space-y-3" aria-label="Season exclusions">
        <h3 className="font-semibold">Season exclusions</h3>
        <p className="text-sm text-muted-foreground">Teams participate in every season by default. Check a season to exclude this team from its standings and statistics.</p>
        <div className="flex flex-wrap gap-2">{['S1', 'S2', 'S3', 'S4', ...seasons.filter(season => !['S1', 'S2', 'S3', 'S4'].includes(season))].map(season => <Label key={season} className="flex min-h-11 items-center gap-2 rounded-md border px-3">
          <Checkbox checked={seasons.includes(season)} onCheckedChange={() => toggleSeason(season)} aria-label={`Exclude ${season}`} />{season}
        </Label>)}</div>
        <Label htmlFor={`${fieldId}-season`}>Add another season</Label>
        <div className="flex gap-2"><Input id={`${fieldId}-season`} value={newSeason} onChange={event => setNewSeason(event.target.value.replaceAll(/[^a-zA-Z0-9]/g, '').slice(0, 6))} placeholder="e.g. S5" /><Button type="button" variant="outline" onClick={addNewSeason} disabled={!newSeason}>Add</Button></div>
        {seasons.length > 0 && <p className="break-words text-sm text-muted-foreground">Excluded from: {seasons.join(', ')}</p>}
      </section>
      <Separator />
      <div className="space-y-3">
        <Label htmlFor={`${fieldId}-logo`}>Team logo</Label>
        <div className="flex items-center gap-3"><div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">{logoUrl ? <MediaImage src={mediaUrl(logoUrl)} alt="Team logo preview" className="size-full object-contain" /> : <Shield className="size-6 text-muted-foreground" />}</div><Input id={`${fieldId}-logo`} type="file" accept="image/*" disabled={logoBusy} onChange={event => { void handleLogoFile(event.target.files?.[0]); }} /></div>
        {logoBusy && <p role="status" className="text-sm text-muted-foreground">Processing logo…</p>}
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button><Button type="button" onClick={() => { void handleSave(); }} disabled={loading || logoBusy}>{loading ? 'Saving…' : 'SAVE CHANGES'}</Button></div>
    </div>
  </ModalShell>;
};

export const SubmitTeamModal = ({ account, onClose, onSave }: { account: Account; onClose: () => void; onSave: () => void }) => {
  const fieldId = useId();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [color, setColor] = useState('#2d7a4a');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]); // usernames the creator picked (excludes owner)
  const [playerFilter, setPlayerFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const candidates = useRestPage<Pick<Account, 'id' | 'username' | 'position' | 'strikersId' | 'teamId'>>(`/api/accounts?search=${segment(playerFilter)}`);
  const candidatePlayers = (candidates.data?.nodes ?? []).filter(player => player.id !== account.id);

  const toggleMember = (username: string) => {
    setError('');
    setSelectedMembers(prev => {
      if (prev.includes(username)) return prev.filter(u => u !== username);
      // 15-player cap: owner + 14 invitees. Warn but don't add if already at cap.
      if (prev.length >= 14) {
        setError('Roster cap is 15 (owner + 14 invitees). Deselect someone to swap.');
        return prev;
      }
      return [...prev, username];
    });
  };

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Team logo must be an image file'); return; }
    setError('');
    setLogoBusy(true);
    try {
      // logos are square-ish and small — 300px is plenty
      const dataUrl = await compressImage(file, 300, 0.85);
      setLogoUrl(dataUrl);
    } catch (error_) {
      setError('Could not process logo: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setLogoBusy(false);
  };

  const handleSubmit = async () => {
    setError('');
    // Captain must have their own Strikers Club ID set before they can create
    // a team (same rule that applies to invitees — no unlinked players).
    if (!account.strikersId) {
      setError('You need to set your Strikers Club Player ID on MY CARD before creating a team.');
      return;
    }
    if (!name.trim() || name.length < 3) { setError('Team name must be 3+ characters'); return; }
    if (!tag.trim() || tag.length < 2 || tag.length > 5) { setError('Tag must be 2-5 characters'); return; }
    if (!logoUrl) { setError('Please upload a team logo'); return; }
    setLoading(true);
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const team = {
      id, name: name.trim(), tag: tag.trim().toUpperCase(),
      color, description: description.trim(),
      logoUrl,
      pendingMembers: selectedMembers,
    };
    try {
      team.logoUrl = await uploadImage('team-logo', id, logoUrl);
      await teamApi.createTeam(team); onSave(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not create team.'); }
    finally { setLoading(false); }
  };

  return <ModalShell onClose={onClose} title="Submit team" maxWidth="max-w-xl">
    <div className="space-y-5">
      <Alert><Clock className="size-4" /><AlertDescription>Your team and player invitations will be reviewed by league administrators.</AlertDescription></Alert>
      <div className="space-y-2"><Label htmlFor={`${fieldId}-name`}>Team name</Label><Input id={`${fieldId}-name`} value={name} onChange={event => setName(event.target.value)} maxLength={32} placeholder="FC Lightning" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label htmlFor={`${fieldId}-tag`}>Tag (2–5 characters)</Label><Input id={`${fieldId}-tag`} value={tag} onChange={event => setTag(event.target.value.toUpperCase())} maxLength={5} placeholder="FCL" /></div>
        <div className="space-y-2"><Label htmlFor={`${fieldId}-color`}>Team color</Label><Input id={`${fieldId}-color`} type="color" value={color} onChange={event => setColor(event.target.value)} className="p-1" /></div>
      </div>
      <div className="space-y-2"><Label htmlFor={`${fieldId}-description`}>Description <span className="text-muted-foreground">(optional)</span></Label><Textarea id={`${fieldId}-description`} value={description} onChange={event => setDescription(event.target.value)} maxLength={200} rows={3} placeholder="Tell the league about your squad…" /></div>
      <div className="space-y-3">
        <Label htmlFor={`${fieldId}-logo`}>Team logo <span className="text-muted-foreground">(required)</span></Label>
        <div className="flex items-center gap-3"><div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">{logoUrl ? <MediaImage src={mediaUrl(logoUrl)} alt="Team logo preview" className="size-full object-contain" /> : <Shield className="size-6 text-muted-foreground" />}</div><Input id={`${fieldId}-logo`} type="file" accept="image/*" disabled={logoBusy} onChange={event => { void handleLogoFile(event.target.files?.[0]); }} /></div>
        {logoBusy && <p role="status" className="text-sm text-muted-foreground">Processing logo…</p>}
      </div>
      <Separator />
      <section className="space-y-3" aria-label="Invite players">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Invite players</h3><Badge variant="secondary">{selectedMembers.length + 1} / 15 roster slots</Badge></div>
        <p className="text-sm text-muted-foreground">Your captain spot is included. Invite up to 14 players with a linked Strikers Club ID who are not on another team.</p>
        <Label htmlFor={`${fieldId}-search`}>Search players</Label><Input id={`${fieldId}-search`} value={playerFilter} onChange={event => setPlayerFilter(event.target.value)} placeholder="Search players…" />
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          {candidates.loading && <p role="status" className="p-3 text-sm text-muted-foreground">Loading players…</p>}
          {!candidates.loading && candidatePlayers.length === 0 && <p className="p-3 text-sm text-muted-foreground">No players match this search.</p>}
          {candidatePlayers.map(player => {
            const disabled = !!player.teamId || !player.strikersId;
            return <div key={player.id} className="flex min-h-14 items-center gap-3 border-b px-3 py-2 last:border-0">
              <Checkbox id={`${fieldId}-${player.id}`} checked={selectedMembers.includes(player.username)} disabled={disabled} onCheckedChange={() => toggleMember(player.username)} />
              <Label htmlFor={`${fieldId}-${player.id}`} className={`flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 ${disabled ? 'text-muted-foreground' : ''}`}><span className="break-all">{player.username}</span><span className="flex flex-wrap gap-1"><Badge variant="outline">{player.position}</Badge>{disabled && <Badge variant="secondary">{player.teamId ? 'On a team' : 'No Strikers ID'}</Badge>}</span></Label>
            </div>;
          })}
        </div>
        {candidates.error && <Alert variant="destructive"><AlertDescription>{candidates.error}<Button type="button" variant="link" onClick={candidates.restart}>Restart candidates</Button></AlertDescription></Alert>}
        <PageButtons {...candidates} hasNextPage={candidates.data?.pageInfo.hasNextPage ?? false} />
        {selectedMembers.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Selected invitees">{selectedMembers.map(username => <Button key={username} type="button" variant="secondary" size="sm" onClick={() => toggleMember(username)} aria-label={`Remove ${username}`} className="max-w-full gap-1"><span className="truncate">{username}</span><X className="size-3 shrink-0" /></Button>)}</div>}
      </section>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button><Button type="button" onClick={() => { void handleSubmit(); }} disabled={loading || logoBusy}>{loading ? 'Submitting…' : 'Submit for approval'}</Button></div>
    </div>
  </ModalShell>;
};
