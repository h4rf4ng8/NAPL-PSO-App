import { Flag, User } from 'lucide-react';
import { useState } from 'react';
import { accounts as accountApi } from '../accounts/api';
import type { Account, Rankings } from '../accounts/models';
import type { News } from './models';
import type { Team } from '../teams/models';
import { ArticleCard, QuickStat, ResultRow, Section } from '../../components/Ui';
import { C } from '../../theme/theme';
import { COUNTRIES, flagUrl } from '../../utils/league';
import { getPlayerRanking, tierFromPercentile } from '../../utils/rankings';

// ============ HOME (LANDING PAGE) ============
export const HomeView = ({ account, allPlayers, allTeams, news, rankings, currentSeason, onJump, onUpdate }: { account: Account; allPlayers: Account[]; allTeams: Team[]; news: News[]; rankings?: Rankings | null; currentSeason: string; onJump: (view:string) => void; onUpdate: (account:Account) => void }) => {
  const [editingCountry, setEditingCountry] = useState(false);
  const [countryInput, setCountryInput] = useState('');
  const [countryBusy, setCountryBusy] = useState(false);
  const [countryMsg, setCountryMsg] = useState('');
  const [editingLinks, setEditingLinks] = useState(false);
  const [strikersIdInput, setStrikersIdInput] = useState(account.strikersId || '');
  const [steamUrlInput, setSteamUrlInput] = useState(account.steamUrl || '');
  const [linksBusy, setLinksBusy] = useState(false);
  const [linksMsg, setLinksMsg] = useState('');
  // Country picker — players who registered before the country field existed,
  // or who want to change theirs, can set it from here.
  // Linked accounts — Strikers Club player ID (used to auto-match on match
  // imports) + optional Steam profile URL (display-only). Both stored on the
  // ASL account row. Set them once here and imports will find you.
  const handleSaveLinks = async () => {
    if (linksBusy) return;
    setLinksMsg('');
    const sid = (strikersIdInput || '').trim();
    const surl = (steamUrlInput || '').trim();
    // Guardrail: once strikersId is set, players can't change it here (only
    // admins can, via ADMIN → PLAYERS). Save silently ignores changes to it.
    const finalStrikersId = account.strikersId ?? (sid || null);
    if (sid && !account.strikersId && !/^\d{2,15}$/.test(sid)) {
      setLinksMsg('Strikers Club Player ID should be a number (2-15 digits)');
      return;
    }
    if (surl && !/^https?:\/\/(www\.)?steamcommunity\.com\//i.test(surl)) {
      setLinksMsg('Steam URL should start with https://steamcommunity.com/');
      return;
    }
    setLinksBusy(true);
    try {
      const updated = await accountApi.patchAccount(account.id,{strikersId: finalStrikersId, steamUrl: surl || null});
      onUpdate?.(updated);
      setEditingLinks(false);
      setLinksMsg('');
    } catch (error) {
      setLinksMsg('Could not save: ' + (error instanceof Error ? error.message : String(error)));
    }
    setLinksBusy(false);
  };

  const handleSaveCountry = async () => {
    if (countryBusy) return;
    setCountryMsg('');
    if (!countryInput) { setCountryMsg('Please pick a country'); return; }
    setCountryBusy(true);
    try {
      const updated = await accountApi.patchAccount(account.id,{country: countryInput});
      onUpdate?.(updated);
      setEditingCountry(false);
      setCountryMsg('');
    } catch (error) {
      setCountryMsg('Could not save country: ' + (error instanceof Error ? error.message : String(error)));
    }
    setCountryBusy(false);
  };

  
  const myRanking = getPlayerRanking(account, rankings);

  const announcements = news.filter(n => n.type === 'announcement').sort((a, b) => {
    return a.pinned === b.pinned ? b.createdAt - a.createdAt : Number(b.pinned) - Number(a.pinned);
  }).slice(0, 3);

  const upcomingMatchups = news.filter(n => n.type === 'matchup' && (n.date || 0) >= Date.now())
    .sort((a, b) => (a.date || 0) - (b.date || 0)).slice(0, 3);

  const recentResults = news.filter(n => n.type === 'result')
    .sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 3);

  // Top 3 players this season per leaderboard score
  const topPlayers = [...allPlayers]
    .map(p => ({ player: p, score: getPlayerRanking(p, rankings).score, ranked: getPlayerRanking(p, rankings).ranked }))
    .filter(x => x.ranked)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const teamById = (id: string | null | undefined) => allTeams.find(t => t.id === id);

  return (
    <div className="space-y-8">
      {/* HERO */}
      <div className="rounded-2xl overflow-hidden relative" style={{
        background: `linear-gradient(135deg, ${C.brandNavy} 0%, ${C.brandNavyDeep} 100%)`,
        boxShadow: `0 8px 28px ${C.brandNavy}33`,
      }}>
        {/* Subtle pitch lines */}
        <div className="absolute inset-0 pitch-lines opacity-15 pointer-events-none" />
        {/* Diagonal accent */}
        <div className="absolute pointer-events-none" style={{
          top: 0, right: 0, width: '40%', height: '100%',
          background: `linear-gradient(120deg, transparent 50%, ${C.green}33 60%, ${C.green}55 75%, transparent 90%)`,
        }} />
        <div className="relative px-6 py-10 md:py-14 md:px-10">
          <div className="font-mono text-[10px] tracking-[0.4em] mb-2" style={{ color: `${C.white}99` }}>
            // SEASON {currentSeason} • OFFICIAL LEAGUE HUB
          </div>
          <h1 className="font-display tracking-tight leading-[0.9]" style={{
            fontSize: 'clamp(36px, 8vw, 68px)',
            color: C.white,
          }}>
            WELCOME BACK,<br />
            <span style={{ color: C.goldLight }}>{account.username.toUpperCase()}</span>
          </h1>
          <p className="font-body mt-3 max-w-md" style={{ color: `${C.white}cc`, fontSize: 16 }}>
            Alliance Strikers League — your official Strikers Club community. Track your career, follow the league, climb the ranks.
          </p>
          <div className="flex gap-3 mt-6 flex-wrap">
            <button
              onClick={() => onJump('me')}
              className="px-5 py-2.5 font-heading tracking-wider text-sm rounded transition-all hover:scale-[1.02] flex items-center gap-2"
              style={{
                background: C.white, color: C.brandNavy,
                boxShadow: `0 4px 12px ${C.brandNavyDeep}55`,
              }}
            ><User size={14} /> MY PLAYER CARD</button>
            <button
              onClick={() => onJump('news')}
              className="px-5 py-2.5 font-heading tracking-wider text-sm rounded transition-all flex items-center gap-2"
              style={{
                background: 'transparent', color: C.white,
                border: `1px solid ${C.white}66`,
              }}
            ><Flag size={14} /> LATEST NEWS</button>
          </div>
        </div>
      </div>

      {/* QUICK STATS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStat label="YOUR TIER" value={myRanking.ranked ? tierFromPercentile(myRanking.percentile) : '—'} accent={C.goldLight} />
        <QuickStat label="GAMES PLAYED" value={account.stats?.games || 0} accent={C.green} />
        <QuickStat label="LEAGUE PLAYERS" value={allPlayers.length} accent={C.brandNavy} />
        <QuickStat label="ACTIVE TEAMS" value={allTeams.filter(t => t.status === 'approved').length} accent={C.red} />
      </div>

      {/* MY PROFILE — email + country */}
      <div className="rounded-2xl p-5" style={{
        background: C.white,
        border: `1px solid ${C.navyLight}`,
        boxShadow: `0 4px 16px ${C.brandNavy}11`,
      }}>
        <div className="flex items-center gap-2 mb-4">
          <User size={15} style={{ color: C.green }} />
          <span className="font-display text-lg tracking-wider" style={{ color: C.brandNavy }}>MY PROFILE</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* EMAIL */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.brandNavy}88` }}>EMAIL</div>
            <span className="font-body text-sm">{account.email || 'Managed through Discord'}</span>
          </div>
          {/* COUNTRY */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.brandNavy}88` }}>COUNTRY</div>
            {!editingCountry && account.country ? (
              <div className="flex items-center gap-2 flex-wrap">
                {flagUrl(account.country) && (
                  <img src={flagUrl(account.country) || undefined} alt="" style={{ width: 24, height: 16, objectFit: 'cover', borderRadius: 2, border: `1px solid ${C.navyLight}` }} />
                )}
                <span className="font-body text-sm" style={{ color: C.brandNavy }}>{account.country}</span>
                <button
                  onClick={() => { setEditingCountry(true); setCountryInput(account.country || ''); }}
                  className="font-mono text-[10px] tracking-wider"
                  style={{ color: C.green, textDecoration: 'underline' }}
                >CHANGE</button>
              </div>
            ) : (editingCountry ? (
              <div className="space-y-2">
                <select
                  value={countryInput}
                  onChange={(e) => setCountryInput(e.target.value)}
                  className="w-full px-3 py-2 font-body text-sm focus:outline-none rounded"
                  style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
                >
                  <option value="">— Select a country —</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveCountry}
                    disabled={countryBusy}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                    style={{ background: C.green, color: C.onColor }}
                  >{countryBusy ? 'SAVING...' : 'SAVE'}</button>
                  <button
                    onClick={() => { setEditingCountry(false); setCountryMsg(''); }}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                    style={{ background: 'transparent', color: `${C.brandNavy}99`, border: `1px solid ${C.navyLight}` }}
                  >CANCEL</button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="font-body text-sm italic" style={{ color: `${C.brandNavy}66` }}>Not set</div>
                <button
                  onClick={() => { setEditingCountry(true); setCountryInput(''); }}
                  className="font-mono text-[11px] tracking-wider"
                  style={{ color: C.green, textDecoration: 'underline' }}
                >+ Set your country</button>
              </div>
            ))}
            {countryMsg && (
              <div className="font-mono text-[11px] mt-1" style={{ color: C.red }}>{countryMsg}</div>
            )}
          </div>
          {/* LINKED ACCOUNTS — Strikers Club Player ID (used by match imports)
              + Steam profile URL (display-only). Both optional but linking your
              Strikers Club ID means imports will find your stats automatically. */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.brandNavy}88` }}>LINKED ACCOUNTS</div>
            {editingLinks ? (
              <div className="space-y-2">
                {/* Strikers Club ID — LOCKED once set. Only admins can change
                    it after that (via ADMIN → PLAYERS). This prevents players
                    from swapping IDs to claim someone else's stats. */}
                {account.strikersId ? (
                  <div>
                    <div className="font-mono text-[9px] tracking-wider mb-0.5" style={{ color: `${C.brandNavy}77` }}>STRIKERS CLUB PLAYER ID</div>
                    <div className="px-3 py-2 font-mono text-sm rounded flex items-center justify-between" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44`, color: `${C.brandNavy}` }}>
                      <span>{account.strikersId}</span>
                      <span className="font-mono text-[9px] tracking-widest" style={{ color: `${C.brandNavy}88` }}>🔒 LOCKED</span>
                    </div>
                    <div className="font-mono text-[9px] mt-0.5" style={{ color: `${C.brandNavy}77` }}>Once set, this can only be changed by an admin. Contact staff if it's wrong.</div>
                  </div>
                ) : (
                  <div>
                    <div className="font-mono text-[9px] tracking-wider mb-0.5" style={{ color: `${C.brandNavy}77` }}>STRIKERS CLUB PLAYER ID</div>
                    <input
                      type="text"
                      value={strikersIdInput}
                      onChange={(e) => setStrikersIdInput(e.target.value.replaceAll(/\D/g, ''))}
                      placeholder="e.g. 365702"
                      className="w-full px-3 py-2 font-mono text-sm focus:outline-none rounded"
                      style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
                    />
                    <div className="font-mono text-[9px] mt-0.5" style={{ color: C.red }}>⚠ REQUIRED to join a team. Numbers only. Find it in-game on your profile. Can only be set once — after that only an admin can change it.</div>
                  </div>
                )}
                <div>
                  <div className="font-mono text-[9px] tracking-wider mb-0.5" style={{ color: `${C.brandNavy}77` }}>STEAM PROFILE URL (OPTIONAL)</div>
                  <input
                    type="url"
                    value={steamUrlInput}
                    onChange={(e) => setSteamUrlInput(e.target.value)}
                    placeholder="https://steamcommunity.com/id/…"
                    className="w-full px-3 py-2 font-body text-sm focus:outline-none rounded"
                    style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveLinks}
                    disabled={linksBusy}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded disabled:opacity-50"
                    style={{ background: C.green, color: C.onColor }}
                  >{linksBusy ? 'SAVING...' : 'SAVE'}</button>
                  <button
                    onClick={() => { setEditingLinks(false); setLinksMsg(''); }}
                    className="px-3 py-1.5 font-heading tracking-wider text-[11px] rounded"
                    style={{ background: 'transparent', color: `${C.brandNavy}99`, border: `1px solid ${C.navyLight}` }}
                  >CANCEL</button>
                </div>
                {linksMsg && (
                  <div className="font-mono text-[11px] mt-1" style={{ color: C.red }}>{linksMsg}</div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap font-body text-sm" style={{ color: C.brandNavy }}>
                  <span style={{ color: `${C.brandNavy}88` }}>Strikers Club ID:</span>
                  {account.strikersId ? (
                    <span className="font-mono" style={{ color: C.brandNavy }}>{account.strikersId}</span>
                  ) : (
                    <span className="italic" style={{ color: `${C.brandNavy}66` }}>not set</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap font-body text-sm" style={{ color: C.brandNavy }}>
                  <span style={{ color: `${C.brandNavy}88` }}>Steam:</span>
                  {account.steamUrl ? (
                    <a href={account.steamUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs" style={{ color: C.brandNavy, textDecoration: 'underline' }}>
                      {account.steamUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
                    </a>
                  ) : (
                    <span className="italic" style={{ color: `${C.brandNavy}66` }}>not set</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditingLinks(true);
                    setStrikersIdInput(account.strikersId || '');
                    setSteamUrlInput(account.steamUrl || '');
                  }}
                  className="font-mono text-[11px] tracking-wider"
                  style={{ color: C.green, textDecoration: 'underline' }}
                >{(account.strikersId || account.steamUrl) ? 'CHANGE' : '+ Link accounts'}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* LEFT: Pinned announcements + recent news */}
        <div className="lg:col-span-2 space-y-6">
          {announcements.length > 0 && (
            <Section title="LATEST FROM THE LEAGUE" onMore={() => onJump('news')}>
              <div className="space-y-3">
                {announcements.map(a => (
                  <ArticleCard key={a.id}
                    title={a.title}
                    body={a.body}
                    pinned={a.pinned}
                    date={a.createdAt}
                    author={a.author}
                  />
                ))}
              </div>
            </Section>
          )}

          {recentResults.length > 0 && (
            <Section title="RECENT RESULTS" onMore={() => onJump('news')}>
              <div className="space-y-2">
                {recentResults.map(r => (
                  <ResultRow key={r.id} r={r} home={teamById(r.homeTeamId)} away={teamById(r.awayTeamId)} />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* RIGHT: Upcoming + top players */}
        <div className="space-y-6">
          {upcomingMatchups.length > 0 && (
            <Section title="UPCOMING">
              <div className="space-y-2">
                {upcomingMatchups.map(m => {
                  const home = teamById(m.homeTeamId);
                  const away = teamById(m.awayTeamId);
                  return (
                    <div key={m.id} className="rounded-lg p-3" style={{
                      background: C.white,
                      border: `1px solid ${C.navyLight}`,
                    }}>
                      <div className="font-mono text-[9px] tracking-[0.25em] mb-1.5" style={{ color: C.green }}>
                        {new Date(m.date || 0).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()} • {new Date(m.date || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading text-sm tracking-wider" style={{ color: C.brandNavy }}>{home?.name || '?'}</span>
                        <span className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>VS</span>
                        <span className="font-heading text-sm tracking-wider" style={{ color: C.brandNavy }}>{away?.name || '?'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {topPlayers.length > 0 && (
            <Section title="TOP RANKED" onMore={() => onJump('leaderboard')}>
              <div className="space-y-2">
                {topPlayers.map(({ player, score }, i) => (
                  <div key={player.username} className="rounded-lg p-3 flex items-center gap-3" style={{
                    background: C.white,
                    border: `1px solid ${C.navyLight}`,
                  }}>
                    <div className="font-display text-2xl" style={{ color: i === 0 ? C.goldLight : C.brandNavy, minWidth: 28 }}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.brandNavy }}>
                        {player.username.toUpperCase()}
                      </div>
                      <div className="font-mono text-[10px]" style={{ color: `${C.brandNavy}66` }}>
                        {player.position} • {player.stats?.games || 0} GAMES
                      </div>
                    </div>
                    <div className="font-display text-xl" style={{ color: C.brandNavy }}>{score}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};
