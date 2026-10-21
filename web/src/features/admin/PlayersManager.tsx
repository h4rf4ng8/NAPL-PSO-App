import { usePageCursor } from '../../hooks/use-page-cursor';
import { useQuery } from '@apollo/client/react';
import { TeamSummariesDocument } from '../../api/generated/graphql';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { readText } from '../../api/page';
import { User, Users } from 'lucide-react';
import { useState } from 'react';
import { accounts as accountApi } from '../accounts/api';
import { teams as teamApi } from '../teams/api';
import type { PositionRequest, AdminPlayer } from '../accounts/models';
import { C } from '../../theme/theme';
import { ALL_POSITIONS, POSITIONS } from '@napl/contracts/league';






// Players Manager
export const PlayersManager = ({ currentSeason: _currentSeason = 'S1', onRefresh }: { currentSeason?: string; onRefresh: () => void }) => {
  const [search, setSearch] = useState('');
  const playerPage = useRestPage<AdminPlayer>('/api/accounts?search='+encodeURIComponent(search));
  const allPlayers = playerPage.data?.nodes ?? [];
  const [teamSearch,setTeamSearch] = useState('');
  const cursor = usePageCursor(teamSearch);
  const teamQuery = useQuery(TeamSummariesDocument, { variables: { scope: null, status: null, search: teamSearch, after: cursor.after } });
  const teamPage = { data: teamQuery.data && { ...teamQuery.data.teamSummaries, nodes: teamQuery.data.teamSummaries.nodes.map(team => ({ ...team, color: team.color ?? '', createdAt: team.createdAt ?? 0 })) }, loading: teamQuery.loading, error: teamQuery.error?.message,
    canPrevious: cursor.canPrevious, previous: cursor.previous,
    next: () => { if (teamQuery.data?.teamSummaries.pageInfo.hasNextPage) cursor.next(teamQuery.data.teamSummaries.pageInfo.endCursor); },
  };
  const allTeams = teamPage.data?.nodes ?? [];
  const pendingPage = useRestPage<PositionRequest & {reasonUrl:string}>('/api/position-requests?status=pending');
  const pendingPosRequests = pendingPage.data?.nodes ?? [];
  const [reasons,setReasons] = useState<Record<string,string>>({});
  const refresh = () => { playerPage.restart(); pendingPage.restart(); onRefresh(); };
  const [teamEditing, setTeamEditing] = useState<AdminPlayer | null>(null); // account whose team is being changed
  const [sidEditing, setSidEditing] = useState<AdminPlayer | null>(null); // account whose Strikers ID is being changed
  const [newSid, setNewSid] = useState('');
  const [posEditing, setPosEditing] = useState<AdminPlayer | null>(null); // account whose position is being changed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Local date formatter — fmtDate is defined inside other components (not
  // global), so we need our own here.
  const fmtDate = (ms: number | null | undefined) => {
    if (!ms) return '';
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const loadPendingPosRequests = () => pendingPage.restart();

  const approvePosRequest = async (req: PositionRequest) => {
    setBusy(true);
    try {
      await accountApi.approvePositionRequest(req.id);
      setInfo(`✓ Approved: ${req.username} is now ${req.toPos}`);
      await loadPendingPosRequests();
      refresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) { setError('Could not approve: ' + (error_ instanceof Error ? error_.message : String(error_))); }
    setBusy(false);
  };
  const denyPosRequest = async (req: PositionRequest) => {
    setBusy(true);
    try {
      await accountApi.denyPositionRequest(req.id);
      setInfo(`✓ Denied: ${req.username}'s request`);
      await loadPendingPosRequests();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) { setError('Could not deny: ' + (error_ instanceof Error ? error_.message : String(error_))); }
    setBusy(false);
  };

  const approvedTeams = allTeams.filter(t => t.status === 'approved');
  const teamById = (id: string | null | undefined) => allTeams.find(t => t.id === id);

  const filtered = allPlayers
    .filter(p => !search || p.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.username.toLowerCase().localeCompare(b.username.toLowerCase()));

  // Reassign (or remove) a player's team. newTeamId === '' means make them a
  // free agent. Keeps both the old and new teams' member arrays in sync.
  // Flag/unflag a player as a cheater. Just toggles the boolean — the visual
  // CHEATER stamp on their card appears wherever PlayerCard renders.
  const toggleCheater = async (player: AdminPlayer) => {
    const wasCheater = !!player.cheater;
    const label = wasCheater ? `Remove CHEATER flag from ${player.username}?` : `Flag ${player.username} as CHEATER? Their card will show a red diagonal CHEATER stamp.`;
    if (!confirm(label)) return;
    setError(''); setBusy(true);
    try {
      await accountApi.patchAccount(player.id,{cheater:!wasCheater});
      refresh();
    } catch (error_) {
      setError('Could not toggle cheater: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const changePosition = async (player: AdminPlayer, newPos: string) => {
    setError('');
    if (!newPos || newPos === player.position) { setPosEditing(null); return; }
    if (!(ALL_POSITIONS as readonly string[]).includes(newPos)) { setError('Invalid position'); return; }
    setBusy(true);
    try {
      await accountApi.patchAccount(player.id,{position:newPos});
      setInfo(`✓ ${player.username}'s position changed to ${newPos}`);
      setPosEditing(null);
      refresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) {
      setError('Could not change position: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const changeTeam = async (player: AdminPlayer, newTeamId: string) => {
    setError('');
    // No team assignment without a Strikers Club ID linked on the account.
    // Admins can set the ID via the SC ID button on this same row.
    if (newTeamId && !player.strikersId) {
      setError(`${player.username} has no Strikers Club ID linked. Set it via the SC ID button before assigning a team.`);
      return;
    }
    setBusy(true);
    try {
      const oldTeamId = player.teamId || null;
      if (oldTeamId === (newTeamId || null)) { setTeamEditing(null); setBusy(false); return; }

      if(newTeamId) await teamApi.changeMembership(newTeamId,'join',player.id);
      else if(oldTeamId) await teamApi.changeMembership(oldTeamId,'leave',player.id);

      const label = newTeamId ? (teamById(newTeamId)?.name || 'team') : 'Free Agent';
      setInfo(`✓ ${player.username} → ${label}`);
      setTeamEditing(null);
      refresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) {
      setError('Could not change team: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  // Admin override for Strikers Club Player ID. Players can't change theirs
  // once set (see MY CARD); this is the only escape hatch. Empty input clears it.
  const startSidEdit = (player: AdminPlayer) => {
    setSidEditing(player);
    setNewSid(player.strikersId || '');
    setError('');
  };
  const saveSid = async () => {
    if(!sidEditing)return;
    setError('');
    const sid = (newSid || '').trim();
    if (sid && !/^\d{2,15}$/.test(sid)) {
      setError('Strikers Club Player ID must be 2-15 digits, or empty to clear.');
      return;
    }
    setBusy(true);
    try {
      await accountApi.patchAccount(sidEditing.id,{strikersId:sid||null});
      setInfo(`✓ ${sidEditing.username} → Strikers ID ${sid || 'cleared'}`);
      setSidEditing(null);
      refresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) {
      setError('Could not save: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
        border: `1px solid ${C.gold}55`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <User size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>MANAGE PLAYERS</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Manage player teams, positions, and Strikers Club IDs. Usernames are synchronized from Discord at sign-in.
        </p>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}
      {error && !teamEditing && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>
      )}

      {playerPage.loading && <p role="status">Loading players…</p>}
      {(playerPage.error || pendingPage.error || teamPage.error) && <p role="alert">{playerPage.error || pendingPage.error || teamPage.error}</p>}
      <PageButtons {...playerPage} hasNextPage={playerPage.data?.pageInfo.hasNextPage ?? false} />
      <PageButtons {...pendingPage} hasNextPage={pendingPage.data?.pageInfo.hasNextPage ?? false} />
      {/* POSITION CHANGE REQUESTS — pending queue for admin review */}
      {pendingPosRequests.length > 0 && (
        <div className="rounded-xl p-4" style={{
          background: `${C.gold}11`, border: `1px solid ${C.gold}66`,
        }}>
          <div className="font-display tracking-wider text-sm mb-3 flex items-center gap-2" style={{ color: C.brandNavy }}>
            <span style={{ color: C.goldLight }}>◆</span>
            POSITION CHANGE REQUESTS ({pendingPage.data?.totalCount ?? 0})
          </div>
          <div className="space-y-2">
            {pendingPosRequests.map(req => (
              <div key={req.id} className="rounded-lg p-3" style={{
                background: C.white, border: `1px solid ${C.navyLight}66`,
              }}>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <div className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>
                      {req.username.toUpperCase()}
                    </div>
                    <div className="font-mono text-[10px] tracking-widest mt-1" style={{ color: `${C.brandNavy}88` }}>
                      <b>{req.fromPos}</b> → <b style={{ color: C.goldLight }}>{req.toPos}</b>
                      <span style={{ marginLeft: 10 }}>{fmtDate(req.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => approvePosRequest(req)} disabled={busy}
                      className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded disabled:opacity-50"
                      style={{ background: C.green, color: C.onColor }}
                    >APPROVE</button>
                    <button
                      onClick={() => denyPosRequest(req)} disabled={busy}
                      className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded disabled:opacity-50"
                      style={{ background: `${C.red}cc`, color: C.cream }}
                    >DENY</button>
                  </div>
                </div>
                <button onClick={() => { void readText((req as PositionRequest & {reasonUrl:string}).reasonUrl).then(value=>{setReasons(previous=>({...previous,[req.id]:value}));}).catch(()=>{setError('Could not load request reason.');}); }}>Read reason</button>
                {reasons[req.id] && (
                  <div className="font-body text-xs italic px-2 py-1.5 rounded" style={{ background: `${C.navyLight}22`, color: `${C.brandNavy}cc` }}>
                    "{reasons[req.id]}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players…"
        className="w-full rounded px-3 py-2 text-sm"
        style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
      />

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="font-mono text-xs tracking-wider text-center py-4" style={{ color: `${C.cream}66` }}>
            NO PLAYERS FOUND
          </div>
        ) : filtered.map(p => {
          const playerTeam = p.team ?? (p.teamId ? teamById(p.teamId) : null);
          return (
          <div key={p.id || p.username} className="rounded-lg p-3" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
            {(() => { if (teamEditing && (teamEditing.id === p.id)) return (
              <div className="space-y-2">
                <div className="font-mono text-[10px] tracking-[0.2em]" style={{ color: `${C.brandNavy}77` }}>
                  CHANGE TEAM — {p.username.toUpperCase()}
                </div>
                <input aria-label="Find team" placeholder="Find team…" value={teamSearch} onChange={event=>setTeamSearch(event.target.value)} />
                <PageButtons {...teamPage} hasNextPage={teamPage.data?.pageInfo.hasNextPage ?? false} />
                <select
                  autoFocus
                  defaultValue={p.teamId || ''}
                  onChange={(e) => changeTeam(p, e.target.value)}
                  disabled={busy}
                  className="w-full rounded px-3 py-2 font-body text-sm"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
                >
                  <option value="">— Free Agent (no team) —</option>
                  {p.teamId && approvedTeams.every(team=>team.id!==p.teamId) && <option value={p.teamId}>Current team</option>}
                  {approvedTeams.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>
                  ))}
                </select>
                {error && <div className="font-mono text-[11px] px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.red }}>{error}</div>}
                <button
                  onClick={() => { setTeamEditing(null); setError(''); }}
                  className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                >CANCEL</button>
              </div>
            ); if (posEditing && (posEditing.id === p.id)) return (
              <div className="space-y-2">
                <div className="font-mono text-[10px] tracking-[0.2em]" style={{ color: `${C.brandNavy}77` }}>
                  POSITION — {p.username.toUpperCase()}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {POSITIONS.map(pos => (
                    <button
                      key={pos}
                      disabled={busy}
                      onClick={() => changePosition(p, pos)}
                      className="px-3 py-2 font-heading tracking-wider text-xs rounded disabled:opacity-50"
                      style={pos === p.position
                        ? { background: C.gold, color: C.brandNavyDeep, border: `1px solid ${C.goldLight}` }
                        : { background: `${C.navyLight}44`, color: C.brandNavy, border: `1px solid ${C.navyLight}66` }
                      }
                    >{pos}{pos === p.position ? ' ✓' : ''}</button>
                  ))}
                </div>
                {error && <div className="font-mono text-[11px] px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.red }}>{error}</div>}
                <button
                  onClick={() => { setPosEditing(null); setError(''); }}
                  className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                >CANCEL</button>
              </div>
            ); if (sidEditing && (sidEditing.id === p.id)) return (
              <div className="space-y-2">
                <div className="font-mono text-[10px] tracking-[0.2em]" style={{ color: `${C.brandNavy}77` }}>
                  STRIKERS CLUB ID — {p.username.toUpperCase()}
                </div>
                <input
                  autoFocus
                  type="text"
                  value={newSid}
                  onChange={(e) => setNewSid(e.target.value.replaceAll(/\D/g, ''))}
                  placeholder="e.g. 365702 (empty to clear)"
                  className="w-full px-3 py-2 font-mono text-sm rounded"
                  style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
                />
                {error && <div className="font-mono text-[11px] px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.red }}>{error}</div>}
                <div className="flex gap-2">
                  <button
                    onClick={saveSid}
                    disabled={busy}
                    className="flex-1 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                    style={{ background: C.green, color: C.onColor }}
                  >{busy ? 'SAVING…' : 'SAVE'}</button>
                  <button
                    onClick={() => { setSidEditing(null); setError(''); }}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                    style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                  >CANCEL</button>
                </div>
              </div>
            ); return (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>
                    {p.username.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                    {p.position} • {p.stats?.games || 0} GAMES
                    {playerTeam
                      ? <span style={{ color: playerTeam.color || C.green }}> • {playerTeam.tag}</span>
                      : <span style={{ color: `${C.brandNavy}44` }}>{p.teamId ? ' • ASSIGNED TEAM' : ' • FREE AGENT'}</span>}
                    {p.strikersId
                      ? <span style={{ color: `${C.brandNavy}77` }}> • SC:{p.strikersId}</span>
                      : <span style={{ color: C.red }}> • NO SC ID</span>}
                  </div>
                </div>
                <button
                  onClick={() => { setPosEditing(p); setTeamEditing(null); setSidEditing(null); setError(''); }}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1.5"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                >POS</button>
                <button
                  onClick={() => { setTeamEditing(p); setSidEditing(null); setPosEditing(null); setError(''); }}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1.5"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                ><Users size={11} /> TEAM</button>

                <button
                  onClick={() => { startSidEdit(p); setTeamEditing(null); }}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1.5"
                  style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
                >SC ID</button>
                <button
                  onClick={() => toggleCheater(p)}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1.5"
                  style={p.cheater
                    ? { background: '#cc0000', color: '#fff', border: '1px solid #800000' }
                    : { background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}55` }
                  }
                >{p.cheater ? 'UNFLAG' : 'CHEATER'}</button>
              </div>
            ); })()}
          </div>
          );
        })}
      </div>
    </div>
  );
};
