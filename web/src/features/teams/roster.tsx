import { MediaImage, mediaUrl } from '../../components/MediaImage';
import { Check, Edit3, Users, X } from 'lucide-react';
import { useMemo,useState } from 'react';
import { teams as teamApi } from './api';
import type { Account } from '../accounts/models';
import type { Team, TeamSummary } from './models';
import { CaptainStar } from '../../components/Icons';
import { ModalShell } from '../../components/Dialog';


import { DEFAULT_FORMATION, FORMATION_IDS, getFormation, isTeamCaptain, resolveLineup } from '../../utils/league';
import { POS } from '@napl/contracts/league';
import { cardTier } from '../../utils/rankings';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../components/ui/command';


export const TeamRosterFormation = ({ team, allPlayers = [], onCardClick, isCaptain = false, onLineupSaved }: { team: TeamSummary & Pick<Team, 'formation' | 'lineup'> & { members?: string[] }; allPlayers?: Account[]; onCardClick: (account:Account) => void; isCaptain?: boolean; onLineupSaved?: () => void }) => {
  // Fetch full account records for each roster member
  const members = useMemo(() => {
    return team.members ? team.members.map(u => allPlayers.find(p => p.username.toLowerCase() === u.toLowerCase())).filter((p):p is Account=>!!p) : allPlayers;
  }, [team.members, allPlayers]);

  // --- EDIT LINEUP STATE ---
  // During edit mode, we keep a draft formation + lineup locally so changes
  // aren't persisted until SAVE. editingSlot: which slot is being filled.
  const [editingLineup, setEditingLineup] = useState(false);
  const [draftFormation, setDraftFormation] = useState(team.formation || DEFAULT_FORMATION);
  const [draftLineup, setDraftLineup] = useState<Record<string,string>>({});
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [savingLineup, setSavingLineup] = useState(false);
  const [lineupError, setLineupError] = useState('');

  // The formation to render — draft while editing, saved otherwise
  const activeFormation = useMemo(
    () => getFormation(editingLineup ? draftFormation : team.formation),
    [team.formation, draftFormation, editingLineup],
  );

  // Starters = resolved lineup. During edit, use the draft formation + draft lineup.
  const starters = useMemo(() => {
    const source = editingLineup
      ? { ...team, formation: draftFormation, lineup: draftLineup }
      : team;
    return resolveLineup(source, members);
  }, [team, draftFormation, draftLineup, editingLineup, members]);

  // Bench = any member not currently in a starter slot
  const bench = useMemo(() => {
    const starterUsernames = new Set(
      Object.values(starters).filter((p):p is Account=>!!p).map(p => p.username.toLowerCase())
    );
    return members.filter(p => !starterUsernames.has(p.username.toLowerCase()));
  }, [members, starters]);

  const beginEdit = () => {
    setLineupError('');
    // Snapshot current resolved lineup (so if nothing was saved, draft starts
    // with the auto-assignment the captain is looking at — easier to tweak).
    // Uses the current formation's slot ids.
    const snapshot:Record<string,string> = { ...team.lineup };
    activeFormation.slots.forEach(s => { if(starters[s.id]) snapshot[s.id] = starters[s.id]!.username; });
    setDraftFormation(team.formation || DEFAULT_FORMATION);
    setDraftLineup(snapshot);
    setEditingLineup(true);
  };
  const cancelEdit = () => {
    setDraftFormation(team.formation || DEFAULT_FORMATION);
    setDraftLineup({});
    setEditingLineup(false);
    setEditingSlot(null);
  };
  // When captain switches formation mid-edit, auto-remap players by position.
  // Any player who was in a slot of position P goes to the new formation's
  // first available slot of position P (keeps the "attack-heavy = 3 STs"
  // intent intact when switching to 3-1-1, say). Overflow goes to bench.
  const changeDraftFormation = (newId: string) => {
    const oldSlots = getFormation(draftFormation).slots;
    const newSlots = getFormation(newId).slots;
    // Group currently assigned players by their old slot's position
    const byPos: Record<string,string[]> = { [POS.ST]: [], [POS.WG]: [], [POS.CM]: [], [POS.DEF]: [], [POS.GK]: [] };
    for (const s of oldSlots) {
      const u = draftLineup[s.id];
      if (u && byPos[s.pos]) byPos[s.pos].push(u);
    }
    // Fill the new formation's slots in order
    const newLineup:Record<string,string> = Object.fromEntries(Object.entries(draftLineup).filter(([key]) => oldSlots.every(slot => slot.id !== key)));
    for (const s of newSlots) {
      const bucket = byPos[s.pos] || [];
      if(bucket.length > 0) newLineup[s.id] = bucket.shift()!;
    }
    setDraftFormation(newId);
    setDraftLineup(newLineup);
    setEditingSlot(null);
  };
  const saveEdit = async () => {
    setSavingLineup(true); setLineupError('');
    try {
      await teamApi.saveLineup(team.id,draftFormation,draftLineup);
      setEditingLineup(false);
      setEditingSlot(null);
      onLineupSaved?.();
    } catch (error) {
      setLineupError('Could not save lineup: ' + (error instanceof Error ? error.message : String(error)));
    }
    setSavingLineup(false);
  };
  // Click a slot while editing — opens the picker for that slot
  const handleSlotEdit = (slotKey: string) => {
    if (!editingLineup) return;
    setEditingSlot(slotKey);
  };
  // Pick a player from the picker → place in the slot. If they're already
  // in another slot, swap them. "Empty" removes any player from this slot.
  const assignToSlot = (username: string | null) => {
    const slotKey = editingSlot;
    if (!slotKey) return;
    setDraftLineup(prev => {
      const next = { ...prev };
      if (username == null) {
        // Empty the slot (benches that player if they were there)
        delete next[slotKey];
      } else {
        // Find if this player is already in another slot — if so, swap
        const currentlyIn = activeFormation.slots.map(s=>s.id).find(k => (prev[k] || '').toLowerCase() === username.toLowerCase());
        if (currentlyIn && currentlyIn !== slotKey) {
          if(prev[slotKey]) next[currentlyIn]=prev[slotKey]; else delete next[currentlyIn]; // put the previously-in-slot player where this one was
        }
        next[slotKey] = username;
      }
      return next;
    });
    setEditingSlot(null);
  };

  // Each slot is a keyboard and touch trigger for the player card or lineup picker.

  return (
    <div className="space-y-6">
      {/* FORMATION — soccer pitch, own half only. 4:5 aspect and capped width
          keep it from dominating the viewport (used to be 2:3 = too tall to
          fit without scrolling on mobile). */}
      <div
        className="rounded-xl relative mx-auto [&_[data-player-name]]:text-white [&_[data-player-name]]:[text-shadow:0_1px_3px_#000]"
        style={{
          background: '#1e6a30',
          border: '2px solid hsl(var(--primary))',
          boxShadow: `inset 0 0 40px rgba(0,0,0,0.35), 0 4px 20px rgba(0,0,0,0.4)`,
          maxWidth: 440,
        }}
      >
        {/* Domain-specific pitch markings stay clipped inside the field. */}
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
          {/* Grass stripes — alternating horizontal bands like a mown pitch */}
          <div className="absolute inset-0" style={{
            backgroundImage: `repeating-linear-gradient(
              180deg,
              #1c6a2e 0px,
              #1c6a2e 32px,
              #1e7332 32px,
              #1e7332 64px
            )`,
          }} />
          {/* Pitch markings — SVG overlay for own-half view. */}
          <svg
            viewBox="0 0 400 500"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            style={{ opacity: 0.75 }}
          >
            {/* Sidelines + goal line at bottom */}
            <line x1="10" y1="0" x2="10" y2="492" stroke="#fff" strokeWidth="2" />
            <line x1="390" y1="0" x2="390" y2="492" stroke="#fff" strokeWidth="2" />
            <line x1="10" y1="492" x2="390" y2="492" stroke="#fff" strokeWidth="2" />
            {/* Halfway line at very top */}
            <line x1="10" y1="8" x2="390" y2="8" stroke="#fff" strokeWidth="2" />
            {/* Bottom half of the center circle sitting on the halfway line */}
            <path d="M 142 8 A 58 58 0 0 0 258 8" fill="none" stroke="#fff" strokeWidth="2" />
            <circle cx="200" cy="8" r="3" fill="#fff" />
            {/* Own penalty box (18-yard) + 6-yard box + penalty spot + arc */}
            <rect x="90" y="417" width="220" height="75" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="140" y="460" width="120" height="32" fill="none" stroke="#fff" strokeWidth="2" />
            <circle cx="200" cy="440" r="2.5" fill="#fff" />
            {/* Goal (small rectangle poking down past goal line) */}
            <rect x="180" y="490" width="40" height="7" fill="none" stroke="#fff" strokeWidth="2" />
            {/* Penalty arc — the D outside the 18-yard box */}
            <path d="M 168 417 A 35 35 0 0 1 232 417" fill="none" stroke="#fff" strokeWidth="2" />
            {/* Corner arcs — bottom two (own corners) */}
            <path d="M 10 482 A 10 10 0 0 1 20 492" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 390 482 A 10 10 0 0 0 380 492" fill="none" stroke="#fff" strokeWidth="2" />
          </svg>
          {/* Vignette for depth */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)',
          }} />
        </div>

        {/* Player rows anchored to the pitch. Container is 4:5 aspect so the
            percentages line up with the pitch markings above. Each slot has
            its own stable key (ST_L, ST_R, CM, DEF_L, DEF_R, GK) which is
            how the lineup is stored. In edit mode slots become clickable to
            swap/empty them via a picker. */}
        <div className="relative w-full" style={{ aspectRatio: '4 / 5' }}>
          {/* Slots retain their saved formation coordinates. */}
          {activeFormation.slots.map(slot => {
            const player = starters[slot.id];
            return (
              <div
                key={slot.id}
                className="asl-slot-wrapper"
                style={{
                  position: 'absolute',
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: editingLineup ? 'pointer' : undefined,
                }}
              >
                {editingLineup && !player ? <Button type="button" variant="ghost" aria-label={`Assign ${slot.label}`} onClick={() => handleSlotEdit(slot.id)} className="size-14 rounded-full border-2 border-dashed border-white/70 bg-black/20 text-xs text-white hover:bg-black/40 hover:text-white">{slot.label}</Button> : <FormationSlot player={player} positionLabel={slot.label} actionLabel={editingLineup ? `Assign ${slot.label}, currently ${player?.username}` : undefined} team={team} onCardClick={editingLineup ? () => handleSlotEdit(slot.id) : onCardClick} />}
              </div>
            );
          })}

          {/* Edit mode overlay: pulsing dashed border around the pitch to
              signal that slots are tappable */}
          {editingLineup && (
            <div className="absolute inset-0 pointer-events-none" style={{
              border: '2px dashed hsl(var(--warning) / 0.6)',
              borderRadius: 12,
            }} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="secondary">{activeFormation.name}</Badge><span className="text-muted-foreground">{activeFormation.label}</span></div>
      {isCaptain && <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{editingLineup ? 'Choose a slot on the pitch to assign, swap, or bench a player.' : 'As captain, you can choose a formation and arrange your starting lineup.'}</p>{editingLineup ? <div className="flex gap-2"><Button variant="outline" onClick={cancelEdit} disabled={savingLineup}>Cancel</Button><Button onClick={() => { void saveEdit(); }} disabled={savingLineup}>{savingLineup ? 'Saving…' : 'Save lineup'}</Button></div> : <Button variant="outline" onClick={beginEdit}><Edit3 className="mr-2 size-4" />Edit lineup</Button>}</div>
        {editingLineup && <div className="space-y-2"><p className="text-sm font-medium">Formation</p><Select value={draftFormation} onValueChange={changeDraftFormation} disabled={savingLineup}><SelectTrigger aria-label="Formation"><SelectValue /></SelectTrigger><SelectContent>{FORMATION_IDS.map(id => <SelectItem key={id} value={id}>{getFormation(id).name} · {getFormation(id).label}</SelectItem>)}</SelectContent></Select></div>}
        {lineupError && <Alert variant="destructive"><AlertDescription>{lineupError}</AlertDescription></Alert>}
      </div>}
      {editingLineup && editingSlot && <ModalShell onClose={() => setEditingSlot(null)} title="Select lineup player" maxWidth="max-w-md">
        <p className="mb-3 text-sm text-muted-foreground">Assign a player to {editingSlot.replace('_', ' ')}. Players already starting will swap slots.</p>
        <Command className="rounded-lg border"><CommandInput placeholder="Search roster…" aria-label="Search roster players" /><CommandList><CommandEmpty>No players found.</CommandEmpty><CommandGroup>
          <CommandItem value="Leave empty bench player" onSelect={() => assignToSlot(null)}><X className="mr-2 size-4" />Leave empty (benches player)</CommandItem>
          {members.map(player => {
            const currentSlot = activeFormation.slots.map(slot => slot.id).find(key => (draftLineup[key] || '').toLowerCase() === player.username.toLowerCase());
            return <CommandItem key={player.username} value={`${player.username} ${player.position}`} onSelect={() => assignToSlot(player.username)}><span className="min-w-0 flex-1 truncate">{player.username}</span><Badge variant="outline">{player.position}</Badge>{currentSlot === editingSlot ? <Check className="ml-2 size-4" /> : currentSlot && <Badge variant="secondary" className="ml-2">Will swap</Badge>}</CommandItem>;
          })}
        </CommandGroup></CommandList></Command>
      </ModalShell>}
      {bench.length > 0 && <section className="space-y-3"><h4 className="flex items-center gap-2 text-lg font-semibold"><Users className="size-4" />Bench <Badge variant="secondary">{bench.length}</Badge></h4><div className="flex flex-wrap gap-3 rounded-xl border bg-muted/30 p-4">{bench.map(player => <FormationSlot key={player.username} player={player} positionLabel={player.position} team={team} onCardClick={onCardClick} />)}</div></section>}
    </div>
  );
};

// Stable component identity keeps focus on the roster trigger when its player dialog closes.
const FormationSlot = ({ player, positionLabel, actionLabel, team, onCardClick }: { player: Account | null; positionLabel: string; actionLabel?: string; team: TeamSummary; onCardClick: (account: Account) => void }) => {
  if (!player) return <div className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-white/60 bg-black/20 text-xs text-white">{positionLabel}</div>;
  const ranking = player.ranking;
  const tier = cardTier(ranking.ranked ? ranking.tier : 'BRONZE');
  const ringColor = tier.from || '#d8b858';
  return <div className="relative flex w-16 flex-col items-center gap-1 rounded-lg p-1">
    <span className="relative" aria-hidden="true"><span className="flex size-10 items-center justify-center overflow-hidden rounded-full border-2 bg-slate-900 sm:size-14" style={{ borderColor: ringColor }}>{player.imageUrl ? <MediaImage src={mediaUrl(player.imageUrl)} alt="" className="size-full object-cover" /> : <span className="text-lg font-semibold" style={{ color: ringColor }}>{player.username.slice(0, 1).toUpperCase()}</span>}</span><span className="absolute -right-1 -top-1 rounded-full border bg-background px-1 text-xs font-semibold text-foreground">{ranking.ranked ? ranking.score : 'NR'}</span></span>
    <span aria-hidden="true" data-player-name className="flex w-full items-center justify-center gap-0.5 text-xs text-foreground">{isTeamCaptain(player, team) && <CaptainStar size={10} />}<span className="truncate">{player.username}</span></span>
    <Button type="button" variant="ghost" onClick={() => onCardClick(player)} aria-label={`${actionLabel ?? `View ${player.username}, ${positionLabel}`}, ${ranking.ranked ? `overall rating ${ranking.score}` : 'unranked'}`} className="absolute inset-0 h-full w-full rounded-lg p-0 hover:bg-black/20" />
  </div>;
};
