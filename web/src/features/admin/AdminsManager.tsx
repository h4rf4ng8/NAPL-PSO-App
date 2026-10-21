import { Crown, Plus, User } from 'lucide-react';
import { useState } from 'react';
import { settings as adminApi } from './api';
import type { AdminPlayer } from '../accounts/models';
import type { RoleAssignment } from './models';
import { C } from '../../theme/theme';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';


// Admins Manager
export const AdminsManager = () => {
  const rolePage = useRestPage<RoleAssignment>('/api/roles');
  const { data, loading, error: loadError, reload } = rolePage;
  const dynamicAdmins = loadError ? [] : data?.nodes ?? [];
  const [saving, setSaving] = useState(false);
  const disabled = !data || loading || !!loadError || saving;
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const playerPage = useRestPage<AdminPlayer>('/api/accounts?search='+encodeURIComponent(search));
  const allPlayers = playerPage.data?.nodes ?? [];

  // Determine who's already an admin (super or dynamic)
  const lcDynamic = dynamicAdmins.map(a => a.username.toLowerCase());
  const allAdminUsernames = new Set(
    lcDynamic
  );

  // Candidates: players not already admins
  const candidates = allPlayers
    .filter(p => !allAdminUsernames.has(p.username.toLowerCase()))
    .filter(p => !search || p.username.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20);

  const saveRoles = async (change: (roles: RoleAssignment[]) => RoleAssignment[], message: string) => {
    if (disabled) return;
    setSaving(true); setError(''); setInfo('');
    try {
      // Replacement writes must include off-page assignments from a fresh complete snapshot.
      await adminApi.setAdminList(change(await adminApi.getAdminList()));
      setPickerOpen(false); setSearch('');
      rolePage.restart();
      setInfo(message);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update administrators.');
    } finally {
      setSaving(false);
    }
  };

  const promote = async (username: string) => {
    if (disabled) return;
    if (allAdminUsernames.has(username.toLowerCase())) { setError('Already an admin'); return; }
    const player = allPlayers.find(p => p.username === username);
    if (!player) return;
    await saveRoles(roles => roles.some(role=>role.userId===player.id) ? roles : [...roles, { userId: player.id, username: player.username, role: 'admin' }], `✓ ${username} promoted to admin`);
  };

  const demote = async (username: string) => {
    if (disabled) return;
    const lc = username.toLowerCase();
    if (dynamicAdmins.some(a => a.username.toLowerCase() === lc && a.role === 'super_admin')) {
      setError('Cannot remove super admin');
      return;
    }
    if (!confirm(`Remove ${username} as admin?`)) return;
    await saveRoles(roles => roles.filter(a => a.username.toLowerCase() !== lc), `✓ ${username} demoted`);
  };

  // Display list: super admins first, then dynamic admins
  const fullList = [
    ...dynamicAdmins.map(a => ({ username: a.username, isSuper: a.role==='super_admin' })),
  ];

  return (
    <div className="space-y-5">
      {loading && <p role="status">Loading administrators…</p>}
      {loadError && <p role="alert">{loadError} <button onClick={() => void reload()}>Try again</button></p>}
      {/* Header */}
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
        border: `1px solid ${C.gold}55`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Crown size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>MANAGE ADMINS</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          Admins can approve teams, submit/review stats, assign awards, and manage seasons. Super admins (yourself) additionally manage who is an admin.
        </p>
      </div>

      {/* Current admins list */}
      <div>
        <h4 className="font-display text-xl tracking-wider mb-3" style={{ color: C.brandNavy }}>
          CURRENT ADMINS ({data?.totalCount ?? 0})
        </h4>
        <div className="space-y-2">
          {fullList.map(({ username, isSuper }) => (
            <div key={username} className="rounded-lg p-3 flex items-center gap-3" style={{
              background: C.white,
              border: `1px solid ${C.navyLight}`,
              borderLeft: `3px solid ${isSuper ? C.goldLight : C.green}`,
            }}>
              <Crown size={18} style={{ color: isSuper ? C.goldLight : C.green }} />
              <div className="flex-1 min-w-0">
                <div className="font-heading tracking-wider text-base" style={{ color: C.brandNavy }}>
                  {username.toUpperCase()}
                </div>
                <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.brandNavy}77` }}>
                  {isSuper ? 'SUPER ADMIN • CANNOT BE REMOVED' : 'REGULAR ADMIN'}
                </div>
              </div>
              {!isSuper && (
                <button
                  disabled={disabled}
                  onClick={() => demote(username)}
                  className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded"
                  style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}
                >REMOVE</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <PageButtons {...rolePage} hasNextPage={rolePage.data?.pageInfo.hasNextPage ?? false} />
      {/* Promote new admin */}
      <div className="rounded-xl p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <div className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>PROMOTE A PLAYER</div>
            <div className="font-mono text-[10px] tracking-wider mt-1" style={{ color: `${C.brandNavy}77` }}>
              ANY REGISTERED PLAYER CAN BE PROMOTED TO ADMIN
            </div>
          </div>
          <button
            disabled={disabled}
            onClick={() => setPickerOpen(o => !o)}
            className="px-4 py-2 font-heading tracking-wider text-xs rounded transition-all hover:scale-[1.02] flex items-center gap-2"
            style={{
              background: pickerOpen ? `${C.navyLight}66` : `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: pickerOpen ? C.brandNavy : C.onColor,
              boxShadow: pickerOpen ? 'none' : `0 2px 8px ${C.green}66`,
            }}
          >{pickerOpen ? <>CANCEL</> : <><Plus size={12} /> PROMOTE</>}</button>
        </div>

        {pickerOpen && (
          <div>
            {playerPage.loading && <p role="status">Loading players…</p>}
            {playerPage.error && <p role="alert">{playerPage.error}</p>}
            <PageButtons {...playerPage} hasNextPage={playerPage.data?.pageInfo.hasNextPage ?? false} />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for a player..."
              className="w-full rounded px-3 py-2 mb-2 text-sm focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
            />
            {candidates.length === 0 ? (
              <div className="font-mono text-xs tracking-wider text-center py-4" style={{ color: `${C.brandNavy}66` }}>
                {search ? 'NO PLAYERS MATCH' : 'ALL PLAYERS ARE ALREADY ADMINS'}
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {candidates.map(p => (
                  <button
                    key={p.username}
                    disabled={disabled}
                    onClick={() => promote(p.username)}
                    className="w-full rounded p-2.5 text-left transition-all hover:scale-[1.01] flex items-center gap-3"
                    style={{
                      background: `${C.navyLight}33`,
                      border: `1px solid ${C.navyLight}`,
                    }}
                  >
                    <User size={14} style={{ color: C.brandNavy }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-heading tracking-wider text-sm" style={{ color: C.brandNavy }}>
                        {p.username.toUpperCase()}
                      </div>
                      <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                        {p.position} • {p.stats?.games || 0} GAMES
                      </div>
                    </div>
                    <div className="font-heading tracking-wider text-[10px] px-2 py-1 rounded" style={{
                      background: `${C.green}22`, color: C.green,
                    }}>PROMOTE →</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div role="alert" className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>}
      {info && <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>}
    </div>
  );
};

