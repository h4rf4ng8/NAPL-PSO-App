import { uploadImage } from '../../api/media';
import { MediaImage, mediaUrl } from '../../components/MediaImage';
import { Check, Clock, Shield, X, XCircle } from 'lucide-react';
import React, { useRef,useState } from 'react';
import { teams as teamApi } from './api';
import type { Account } from '../accounts/models';
import type { Team } from './models';

import { Dialog, ModalShell } from '../../components/Dialog';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { segment } from '../../api/http';
import { C } from '../../theme/theme';
import { compressImage } from '../../utils/input';

// ============ SUBMIT TEAM MODAL ============
// ============ EDIT TEAM MODAL (admin) ============
// Admins can edit any approved team's visual properties — logo, name, tag,
// color, description. Member roster stays managed via the PLAYERS section.
export const EditTeamModal = ({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: () => void }) => {
  const [name, setName] = useState(team.name || '');
  const [tag, setTag] = useState(team.tag || '');
  const [color, setColor] = useState(team.color || C.green);
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
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  const inputStyle = { background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream };
  const Lbl = ({ children }: { children: React.ReactNode }) => <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{children}</label>;

  return (
    <Dialog onClose={onClose} label="Edit team" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.78)' }}>
      <div className="w-full max-w-md rounded-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div className="flex items-center justify-between">
          <div className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>EDIT TEAM</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/10" style={{ color: C.brandNavy }}>
            <X size={18} />
          </button>
        </div>

        <div>
          <Lbl>TEAM NAME</Lbl>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={28}
            className="w-full px-3 py-2 font-body text-sm rounded" style={inputStyle} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Lbl>TAG (2-5)</Lbl>
            <input type="text" value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={5}
              className="w-full px-3 py-2 font-body text-sm rounded" style={inputStyle} />
          </div>
          <div>
            <Lbl>TEAM COLOR</Lbl>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-full h-[42px] rounded cursor-pointer" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66` }} />
          </div>
        </div>

        <div>
          <Lbl>DESCRIPTION (OPTIONAL)</Lbl>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={200}
            className="w-full px-3 py-2 font-body text-sm rounded resize-none" style={inputStyle} />
        </div>

        <div>
          <Lbl>EXCLUDE FROM SEASONS</Lbl>
          <div className="font-mono text-[10px] mb-2 leading-relaxed" style={{ color: `${C.cream}aa` }}>
            Teams participate in <b>all seasons by default</b>. Click a season chip to <b style={{ color: C.redLight }}>EXCLUDE</b> this team from that season (won't show in standings/stats for it).
          </div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {['S1', 'S2', 'S3', 'S4', ...seasons.filter(s => !['S1', 'S2', 'S3', 'S4'].includes(s))].map(s => {
              const excluded = seasons.includes(s);
              return (
                <button key={s} type="button" onClick={() => toggleSeason(s)}
                  className="px-3 py-1.5 font-heading tracking-wider text-xs rounded flex items-center gap-1.5"
                  style={excluded
                    ? { background: `${C.red}cc`, color: C.cream, border: `1px solid ${C.red}` }
                    : { background: C.navyDeep, color: `${C.cream}88`, border: `1px solid ${C.navyLight}66` }
                  }
                >
                  {excluded && <XCircle size={11} />}
                  {s}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5">
            <input type="text" value={newSeason}
              onChange={(e) => setNewSeason(e.target.value.replaceAll(/[^a-zA-Z0-9]/g, '').slice(0, 6))}
              placeholder="Add season (e.g. S5)" className="flex-1 px-3 py-1.5 font-mono text-xs rounded"
              style={inputStyle} />
            <button type="button" onClick={addNewSeason} disabled={!newSeason}
              className="px-3 font-heading tracking-wider text-[11px] rounded disabled:opacity-40"
              style={{ background: `${C.navyLight}88`, color: C.brandNavy }}
            >ADD</button>
          </div>
          {seasons.length > 0 && (
            <div className="font-mono text-[10px] mt-2 px-2 py-1.5 rounded" style={{
              background: `${C.red}22`, color: C.redLight, border: `1px solid ${C.red}44`,
            }}>
              EXCLUDED FROM: {seasons.join(', ')}
            </div>
          )}
        </div>

        <div>
          <Lbl>TEAM LOGO</Lbl>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded flex items-center justify-center shrink-0" style={{
              background: C.navyDeep, border: `1px solid ${C.navyLight}66`,
            }}>
              {logoUrl ? (
                <MediaImage src={mediaUrl(logoUrl)} alt="" className="w-full h-full object-cover rounded" />
              ) : (
                <Shield size={24} style={{ color: `${C.cream}55` }} />
              )}
            </div>
            <input type="file" accept="image/*" ref={logoInputRef} className="hidden"
              onChange={(e) => handleLogoFile(e.target.files?.[0])} />
            <button onClick={() => logoInputRef.current?.click()} disabled={logoBusy}
              className="px-3 py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
              style={{ background: `${C.navyLight}88`, color: C.brandNavy }}
            >{logoBusy ? 'PROCESSING...' : 'CHANGE LOGO'}</button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded font-mono text-xs" style={{
            background: `${C.red}22`, border: `1px solid ${C.red}66`, color: C.redLight,
          }}>
            <XCircle size={12} /> {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 font-heading tracking-wider text-[11px] rounded"
            style={{ background: `${C.navyLight}66`, color: C.brandNavy }}>CANCEL</button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 py-2 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`, color: C.onColor }}
          >{loading ? 'SAVING…' : 'SAVE CHANGES'}</button>
        </div>
      </div>
    </Dialog>
  );
};

export const SubmitTeamModal = ({ account, onClose, onSave }: { account: Account; onClose: () => void; onSave: () => void }) => {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [color, setColor] = useState(C.green);
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]); // usernames the creator picked (excludes owner)
  const [playerFilter, setPlayerFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  const inputStyle = { background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream };
  const Lbl = ({ children }: { children: React.ReactNode }) => <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{children}</label>;

  return (
    <ModalShell onClose={onClose} title="SUBMIT TEAM" maxWidth="max-w-md">
      <div className="mb-4 px-3 py-2 rounded flex items-center gap-2" style={{
        background: `${C.gold}11`, border: `1px solid ${C.gold}44`,
      }}>
        <Clock size={14} style={{ color: C.goldLight }} />
        <span className="font-mono text-[10px] tracking-wider" style={{ color: C.goldLight }}>
          ADMINS WILL REVIEW YOUR TEAM SUBMISSION
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <Lbl>TEAM NAME</Lbl>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={32}
            placeholder="FC Lightning"
            className="w-full rounded px-3 py-2 font-body focus:outline-none"
            style={inputStyle}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Lbl>TAG (2-5)</Lbl>
            <input
              type="text" value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={5}
              placeholder="FCL"
              className="w-full rounded px-3 py-2 font-mono focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <Lbl>TEAM COLOR</Lbl>
            <input
              type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 rounded cursor-pointer"
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <Lbl>DESCRIPTION (OPTIONAL)</Lbl>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={3}
            placeholder="Tell admins about your squad..."
            className="w-full rounded px-3 py-2 font-body text-sm focus:outline-none"
            style={inputStyle}
          />
        </div>
        <div>
          <Lbl>TEAM LOGO (REQUIRED)</Lbl>
          <input
            ref={logoInputRef}
            type="file" accept="image/*"
            onChange={(e) => handleLogoFile(e.target.files?.[0])}
            className="hidden"
          />
          <div className="flex items-center gap-3">
            <div className="rounded-lg flex items-center justify-center shrink-0"
              style={{ width: 56, height: 56, background: C.navyDeep, border: `1px solid ${C.navyLight}66`, overflow: 'hidden' }}>
              {logoUrl
                ? <MediaImage src={mediaUrl(logoUrl)} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <Shield size={22} style={{ color: `${C.cream}44` }} />}
            </div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoBusy}
              className="px-3 py-2 rounded font-mono text-[11px] tracking-wider disabled:opacity-50"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}88`, color: C.cream }}
            >{logoBusy ? 'PROCESSING...' : (logoUrl ? 'CHANGE LOGO' : 'UPLOAD LOGO')}</button>
          </div>
        </div>

        {/* ROSTER PICKER — creator invites players. Locked rows are on another
            team already. Selections are saved as pendingMembers; admin decides
            which get added to the real roster on approval. */}
        <div>
          <Lbl>INVITE PLAYERS (OPTIONAL · ADMIN APPROVES)</Lbl>
          <input
            type="text"
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            placeholder="Search players…"
            className="w-full px-3 py-2 mb-2 rounded font-body text-sm"
            style={inputStyle}
          />
          <div className="rounded-lg max-h-52 overflow-y-auto" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66` }}>
            {candidatePlayers.length === 0 ? (
              <div className="px-3 py-3 font-body text-xs" style={{ color: `${C.cream}66` }}>No other players to invite yet.</div>
            ) : (
              candidatePlayers.map(p => {
                const locked = p.teamId ? { tag: 'A TEAM' } : null;
                const noSid = !p.strikersId; // Must have Strikers ID to join a team
                const checked = selectedMembers.includes(p.username);
                const disabled = !!locked || noSid;
                return (
                  <button
                    key={p.username}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleMember(p.username)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed"
                    style={{
                      borderBottom: `1px solid ${C.navyLight}33`,
                      background: checked ? `${C.green}22` : 'transparent',
                      opacity: disabled ? 0.45 : 1,
                    }}
                  >
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{
                      border: `1.5px solid ${checked ? C.green : `${C.cream}55`}`,
                      background: checked ? C.green : 'transparent',
                    }}>
                      {checked && <Check size={11} style={{ color: C.onColor }} />}
                    </div>
                    <span className="font-heading tracking-wider text-sm flex-1" style={{ color: C.cream }}>
                      {p.username}
                    </span>
                    <span className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}66` }}>
                      {p.position}
                    </span>
                    {locked ? (
                      <span className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded" style={{
                        background: `${C.red}22`, color: C.redLight,
                      }}>ON {locked.tag || 'A TEAM'}</span>
                    ) : (noSid ? (
                      <span className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded" style={{
                        background: `${C.red}22`, color: C.redLight,
                      }}>NO SC ID</span>
                    ) : null)}
                  </button>
                );
              })
            )}
          </div>
          {candidates.error && <p role="alert">{candidates.error}<button onClick={candidates.restart}>Restart candidates</button></p>}
          <PageButtons {...candidates} hasNextPage={candidates.data?.pageInfo.hasNextPage ?? false} />
          <div>{selectedMembers.map(username => <button key={username} onClick={() => toggleMember(username)}>Remove {username}</button>)}</div>
          {selectedMembers.length > 0 && (
            <div className="font-mono text-[10px] tracking-wider mt-1" style={{ color: C.greenLight }}>
              {selectedMembers.length} / 14 invited (admin approves · 15-player cap incl. you)
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded font-mono text-xs" style={{
            background: `${C.red}22`, border: `1px solid ${C.red}66`, color: C.redLight,
          }}>
            <XCircle size={12} /> {error}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 font-display tracking-[0.15em] text-xl disabled:opacity-50 rounded mt-1"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor,
            boxShadow: `0 4px 16px ${C.green}66, inset 0 1px 0 ${C.white}30`,
          }}
        >{loading ? 'SUBMITTING...' : 'SUBMIT FOR APPROVAL'}</button>
      </div>
    </ModalShell>
  );
};
