import { Check, Edit3, Users, X } from 'lucide-react';
import { useMemo,useState } from 'react';
import { teams as teamApi } from './api';
import type { Account } from '../accounts/models';
import type { Team } from './models';
import { CaptainStar } from '../../components/Icons';
import { PlayerCard } from '../../components/PlayerCard';
import { Dialog } from '../../components/Ui';
import { C } from '../../theme/theme';

import { DEFAULT_FORMATION, FORMATION_IDS, getFormation, isTeamCaptain, resolveLineup } from '../../utils/league';
import { POS } from '@napl/contracts/league';
import { cardTier } from '../../utils/rankings';

export const TeamRosterFormation = ({ team, allPlayers = [], onCardClick, isCaptain = false, onLineupSaved }: { team: Team; allPlayers?: Account[]; onCardClick: (account:Account) => void; isCaptain?: boolean; onLineupSaved?: () => void }) => {
  // Fetch full account records for each roster member
  const members = useMemo(() => {
    return (team.members || [])
      .map(u => allPlayers.find(p => p.username.toLowerCase() === u.toLowerCase()))
      .filter((p):p is Account=>!!p);
  }, [team.members, allPlayers]);

  // --- EDIT LINEUP STATE ---
  // During edit mode, we keep a draft formation + lineup locally so changes
  // aren't persisted until SAVE. editingSlot: which slot is being filled.
  const [editingLineup, setEditingLineup] = useState(false);
  const [draftFormation, setDraftFormation] = useState(team.formation || DEFAULT_FORMATION);
  const [draftLineup, setDraftLineup] = useState<Record<string,string>>({});
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [savingLineup, setSavingLineup] = useState(false);

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
    // Snapshot current resolved lineup (so if nothing was saved, draft starts
    // with the auto-assignment the captain is looking at — easier to tweak).
    // Uses the current formation's slot ids.
    const snapshot:Record<string,string> = {};
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
    const newLineup:Record<string,string> = {};
    for (const s of newSlots) {
      const bucket = byPos[s.pos] || [];
      if(bucket.length > 0) newLineup[s.id] = bucket.shift()!;
    }
    setDraftFormation(newId);
    setDraftLineup(newLineup);
    setEditingSlot(null);
  };
  const saveEdit = async () => {
    setSavingLineup(true);
    try {
      await teamApi.saveLineup(team.id,draftFormation,draftLineup);
      setEditingLineup(false);
      setEditingSlot(null);
      onLineupSaved?.();
    } catch (error) {
      alert('Could not save lineup: ' + (error instanceof Error ? error.message : String(error)));
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

  // A single slot in the formation — small avatar icon by default. On hover
  // the FULL-size PlayerCard pops up as a floating overlay above the avatar
  // (or below, for the top row so it doesn't get cut off). Click opens the
  // PlayerCardModal for front + back view.

  return (
    <div className="space-y-6">
      {/* FORMATION — soccer pitch, own half only. 4:5 aspect and capped width
          keep it from dominating the viewport (used to be 2:3 = too tall to
          fit without scrolling on mobile). */}
      <div
        className="rounded-xl relative mx-auto"
        style={{
          background: '#1e6a30',
          border: `2px solid ${C.brandNavyDeep}`,
          boxShadow: `inset 0 0 40px rgba(0,0,0,0.35), 0 4px 20px rgba(0,0,0,0.4)`,
          maxWidth: 440,
        }}
      >
        {/* Grass + markings + vignette clipped to the rounded pitch shape.
            Hover-scaled cards live in the row layer above (unclipped) so they
            can overflow the pitch bounds when hovered without being cut off. */}
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
          {/* Each slot renders at its formation-defined x/y %. We center the
              slot on its anchor point via translate(-50%, -50%). popDown is
              set for slots in the attacking third (y < 20%) so hover preview
              drops downward instead of up off the top edge. */}
          {activeFormation.slots.map(slot => {
            const player = starters[slot.id];
            const popDown = slot.y < 20;
            return (
              <div
                key={slot.id}
                className="asl-slot-wrapper"
                onClick={() => handleSlotEdit(slot.id)}
                style={{
                  position: 'absolute',
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: editingLineup ? 'pointer' : undefined,
                }}
              >
                <FormationSlot player={player} positionLabel={slot.label} popDown={popDown} team={team} onCardClick={onCardClick} />
              </div>
            );
          })}

          {/* Edit mode overlay: pulsing dashed border around the pitch to
              signal that slots are tappable */}
          {editingLineup && (
            <div className="absolute inset-0 pointer-events-none" style={{
              border: `2px dashed ${C.gold}99`,
              borderRadius: 12,
              animation: 'pulse 2s ease-in-out infinite',
            }} />
          )}
        </div>
      </div>

      {/* FORMATION LABEL — shown to everyone above the pitch area */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="font-mono text-[10px] tracking-widest" style={{ color: `${C.cream}99` }}>
          FORMATION: <span style={{ color: C.goldLight, fontWeight: 700 }}>{activeFormation.name}</span>
          <span style={{ color: `${C.cream}66`, marginLeft: 8 }}>— {activeFormation.label}</span>
        </div>
      </div>

      {/* CAPTAIN'S EDIT LINEUP CONTROLS — only visible to the captain of this team */}
      {isCaptain && (
        <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
          {editingLineup ? (
            <>
              <div className="font-mono text-[10px] tracking-wider" style={{ color: C.goldLight }}>
                ◆ EDITING LINEUP — tap any slot above to assign a player
              </div>
              <div className="flex gap-2">
                <button
                  onClick={cancelEdit}
                  disabled={savingLineup}
                  className="px-3 py-1.5 font-heading tracking-wider text-xs rounded disabled:opacity-50"
                  style={{ background: `${C.navyLight}66`, color: C.cream }}
                >CANCEL</button>
                <button
                  onClick={saveEdit}
                  disabled={savingLineup}
                  className="px-3 py-1.5 font-heading tracking-wider text-xs rounded disabled:opacity-50"
                  style={{ background: C.green, color: C.onColor }}
                >{savingLineup ? 'SAVING...' : 'SAVE LINEUP'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.cream}99` }}>
                As captain, you can pick a formation and arrange your starting XI.
              </div>
              <button
                onClick={beginEdit}
                className="px-3 py-1.5 font-heading tracking-wider text-xs flex items-center gap-1.5 rounded"
                style={{ background: C.gold, color: C.brandNavyDeep }}
              ><Edit3 size={11} /> EDIT LINEUP</button>
            </>
          )}
        </div>
      )}

      {/* FORMATION PICKER — only in edit mode. Horizontal chip row showing
          every preset. Changing formation remaps players by position so
          most of the lineup is preserved automatically. */}
      {isCaptain && editingLineup && (
        <div className="mb-4 rounded-lg p-3" style={{
          background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}33`,
        }}>
          <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: `${C.cream}99` }}>
            FORMATION
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {FORMATION_IDS.map(id => {
              const f = getFormation(id);
              const active = draftFormation === id;
              return (
                <button
                  key={id}
                  onClick={() => changeDraftFormation(id)}
                  className="px-3 py-1.5 rounded text-left transition-all"
                  style={active
                    ? { background: C.gold, color: C.brandNavyDeep, border: `1px solid ${C.goldLight}` }
                    : { background: `${C.navyLight}44`, color: C.cream, border: `1px solid ${C.navyLight}66` }
                  }
                  title={f.description}
                >
                  <div className="font-display tracking-wider text-sm leading-none">{f.name}</div>
                  <div className="font-mono text-[9px] mt-0.5 opacity-80">{f.label.toUpperCase()}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SLOT PICKER MODAL — appears when captain taps a slot in edit mode */}
      {editingLineup && editingSlot && (
        <Dialog onClose={() => setEditingSlot(null)} label="Select lineup player" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: `${C.black}cc`, backdropFilter: 'blur(8px)' }}
          onClick={() => setEditingSlot(null)}
        >
          <div className="w-full max-w-md rounded-xl p-5" style={{
            background: C.white,
            border: `1px solid ${C.navyLight}`,
          }} onClick={(e) => e.stopPropagation()}>
            <div className="font-display tracking-[0.15em] text-lg mb-1" style={{ color: C.cream }}>
              SELECT PLAYER
            </div>
            <div className="font-mono text-[10px] tracking-wider mb-3" style={{ color: `${C.cream}99` }}>
              FOR SLOT: {editingSlot.replace('_', ' ')}
            </div>
            <div className="max-h-80 overflow-y-auto rounded" style={{ border: `1px solid ${C.navyLight}33` }}>
              {/* Empty slot option */}
              <button
                onClick={() => assignToSlot(null)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                style={{ borderBottom: `1px solid ${C.navyLight}22`, background: 'transparent' }}
              >
                <X size={14} style={{ color: `${C.cream}66` }} />
                <span className="font-mono text-xs tracking-widest" style={{ color: `${C.cream}99` }}>
                  LEAVE EMPTY (benches player)
                </span>
              </button>
              {members.map(p => {
                const currentlyInSlot = activeFormation.slots.map(s=>s.id).find(k => (draftLineup[k] || '').toLowerCase() === p.username.toLowerCase());
                const isSelectedForThisSlot = currentlyInSlot === editingSlot;
                return (
                  <button
                    key={p.username}
                    onClick={() => assignToSlot(p.username)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                    style={{
                      borderBottom: `1px solid ${C.navyLight}22`,
                      background: isSelectedForThisSlot ? `${C.green}22` : 'transparent',
                    }}
                  >
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{
                      border: `1.5px solid ${isSelectedForThisSlot ? C.green : `${C.cream}55`}`,
                      background: isSelectedForThisSlot ? C.green : 'transparent',
                    }}>
                      {isSelectedForThisSlot && <Check size={11} style={{ color: C.onColor }} />}
                    </div>
                    <span className="font-heading tracking-wider text-sm flex-1" style={{ color: C.cream }}>
                      {p.username}
                    </span>
                    <span className="font-mono text-[9px] tracking-widest" style={{ color: `${C.cream}66` }}>
                      {p.position}
                    </span>
                    {currentlyInSlot && currentlyInSlot !== editingSlot && (
                      <span className="font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded" style={{
                        background: `${C.gold}22`, color: C.goldLight,
                      }}>WILL SWAP</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setEditingSlot(null)}
              className="w-full mt-3 py-2 font-heading tracking-wider text-xs rounded"
              style={{ background: `${C.navyLight}66`, color: C.cream }}
            >CLOSE</button>
          </div>
        </Dialog>
      )}

      {/* BENCH — compact avatar tiles (same treatment as the pitch), denser grid */}
      {bench.length > 0 && (
        <div>
          <h4 className="font-display text-lg tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
            <Users size={14} /> BENCH ({bench.length})
          </h4>
          <div className="flex flex-wrap gap-x-3 gap-y-8 sm:gap-x-4 justify-center sm:justify-start" style={{ paddingTop: 20 }}>
            {bench.map(p => (
              <FormationSlot key={p.username} player={p} positionLabel={p.position} team={team} onCardClick={onCardClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Stable component identity preserves the roster button while a nested card opens.
const SLOT_W = 76;
const SLOT_H = 100;
const FormationSlot = ({ player, positionLabel, popDown = false, team, onCardClick }: { player: Account | null; positionLabel: string; popDown?: boolean; team: Team; onCardClick: (account: Account) => void }) => {
  if (!player) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-full"
        style={{
          width: 60, height: 60,
          background: `${C.navyDeep}88`,
          border: `2px dashed ${C.navyLight}66`,
        }}
      >
        <div className="font-mono text-[9px] tracking-widest" style={{
          color: 'rgba(255,255,255,0.6)',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}>{positionLabel}</div>
      </div>
    );
  }
  const ranking = player.ranking;
  const isRanked = ranking.ranked;
  const ovr = isRanked ? ranking.score : 'NR';
  const tierName = isRanked ? ranking.tier : 'BRONZE';
  const tier = cardTier(tierName);
  const ringColor = tier.from || C.goldLight;
  const ovrTextColor = tier.accent || C.navyDeep;
  const captain = isTeamCaptain(player, team);
  return (
    <button
      type="button"
      onClick={() => onCardClick?.(player)}
      className={`asl-formation-slot focus:outline-none ${popDown ? 'pop-down' : ''}`}
      style={{
        width: SLOT_W, height: SLOT_H,
        background: 'transparent', border: 'none', padding: 0,
        cursor: 'pointer', position: 'relative',
      }}
    >
      {/* Default view: compact avatar icon */}
      <div className="asl-formation-icon flex flex-col items-center">
        <div style={{ position: 'relative' }}>
          <div
            className="rounded-full overflow-hidden flex items-center justify-center"
            style={{
              width: 56, height: 56,
              background: C.navyDeep,
              border: `2.5px solid ${ringColor}`,
              boxShadow: `0 3px 8px rgba(0,0,0,0.5)`,
            }}
          >
            {player.imageUrl ? (
              <img src={player.imageUrl} alt={player.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="font-display text-xl" style={{ color: ringColor }}>
                {(player.username || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div
            className="absolute rounded-full flex items-center justify-center"
            style={{
              top: -3, right: -4,
              width: 22, height: 22,
              background: ringColor,
              color: ovrTextColor,
              border: `1.5px solid ${C.navyDeep}`,
              fontFamily: 'Anton, sans-serif',
              fontSize: ovr === 'NR' ? 9 : 11,
              lineHeight: 1,
            }}
          >{ovr}</div>
        </div>
        <div className="mt-1 font-heading text-[10px] tracking-wider flex items-center gap-0.5 truncate" style={{
          color: '#ffffff',
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
          maxWidth: SLOT_W,
        }}>
          {captain && <CaptainStar size={9} />}
          <span className="truncate">{(player.username || '').toUpperCase()}</span>
        </div>
      </div>

      {/* Hover preview: full-size PlayerCard as floating overlay */}
      <div className="asl-formation-preview" aria-hidden="true">
        <PlayerCard account={player} size="sm" team={team} hideTeam={true} />
      </div>
    </button>
  );
};
