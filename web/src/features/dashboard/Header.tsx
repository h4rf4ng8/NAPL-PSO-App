import { BarChart3, BookOpen, Calendar, ChevronRight, Crown, Flag, Home as HomeIcon, LogOut, Moon, Sparkles, Sun, Swords, Trophy, User, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Account } from '../accounts/models';
import type { News } from '../content/models';
import type { VotingPeriod } from '../voting/models';
import { ASL_LOGO_DIAMOND } from '../../components/Icons';
import { C, type ThemeMode } from '../../theme/theme';
import { isAdmin } from '../../utils/league';

interface Props {
  account: Account; season: string; setSeason: (season: string) => void;
  allSeasons: string[]; tickerNews: News[]; view: string; setView: (view: string) => void;
  currentVotingPeriod: VotingPeriod | null; onLogout: () => void; theme: ThemeMode; toggleTheme: () => void;
}
export function Header({ account, season, setSeason, allSeasons, tickerNews, view, setView, currentVotingPeriod, onLogout, theme, toggleTheme }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [morePos, setMorePos] = useState({ top: 0, right: 0 });
  useEffect(() => {
    if (!moreOpen) return;
    const close = () => setMoreOpen(false);
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      moreBtnRef.current?.focus();
    };
    addEventListener('keydown', key);
    addEventListener('resize', close);
    addEventListener('scroll', close, true);
    return () => { removeEventListener('keydown', key); removeEventListener('resize', close); removeEventListener('scroll', close, true); };
  }, [moreOpen]);
  const mainTabs = [
    { id: 'home', label: 'HOME', icon: HomeIcon },
    { id: 'me', label: 'MY CARD', icon: User },
    { id: 'news', label: 'NEWS', icon: Flag },
    { id: 'teams', label: 'TEAMS', icon: Users },
    { id: 'schedule', label: 'SCHEDULE', icon: Calendar },
    { id: 'standings', label: 'STANDINGS', icon: Trophy },
    { id: 'leaderboard', label: 'STATS', icon: BarChart3 },
  ];
  // Reference tabs (less frequently visited). Live under a MORE dropdown
  // but still have real URLs that work when visited directly.
  const moreTabs = [
    { id: 'transfers', label: 'TRANSFER MARKET', icon: Swords },
    { id: 'hof', label: 'HALL OF FAME', icon: Crown },
    { id: 'tiers', label: 'TIER PREVIEW', icon: Sparkles },
    { id: 'rules', label: 'RULES', icon: BookOpen },
  ];
  // Hidden-from-nav view (reachable only by direct URL / internal links)
  // 'matches' lives here — the main interaction with matches is through
  // MY CARD and TEAMS views, so cluttering the main nav with it is unneeded.
  // ADMIN added below if the user is an admin.
  // VOTE tab appears inline in the main nav only while a voting period is open.
  if (currentVotingPeriod) {
    mainTabs.push({ id: 'vote', label: 'VOTE TOTW', icon: Trophy });
  }
  if (isAdmin(account)) {
    mainTabs.push({ id: 'admin', label: 'ADMIN', icon: Crown });
  }
  // Combined list used in a few places that need to look up by id
  

  return (
<div className="sticky top-0 z-30">
        {/* Glossy blue bar with logo + user chip */}
        <div className="asl-header">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3 relative" style={{ zIndex: 1 }}>
            <div className="asl-logo-plate shrink-0">
              <img src={ASL_LOGO_DIAMOND} alt="ASL" style={{ display: 'block', height: 40 }} />
            </div>
            <div className="min-w-0">
              <div className="asl-wordmark" style={{ fontSize: 28 }}>ASL</div>
              <div className="asl-sublabel hidden sm:block" style={{ fontSize: 14, marginTop: 4, letterSpacing: 7 }}>
                ALLIANCE STRIKERS LEAGUE
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="px-2 py-1 rounded focus:outline-none"
                style={{
                  fontFamily: 'Oswald, sans-serif', fontSize: 11, letterSpacing: 1.5,
                  background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,0,0,0.35)',
                  color: '#fff', textTransform: 'uppercase',
                }}
              >
                <option value="all" style={{ background: '#0e2451' }}>ALL TIME</option>
                {allSeasons.map(s => <option key={s} value={s} style={{ background: '#0e2451' }}>{s}</option>)}
              </select>
              <div className="asl-user-chip hidden sm:flex items-center gap-1.5" style={{ padding: '5px 12px', fontSize: 11 }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#8ce880', boxShadow: '0 0 6px #8ce880' }} />
                @{account.username}
                {isAdmin(account) && <Crown size={11} style={{ color: '#d8b858' }} />}
              </div>
              {/* Theme toggle — sun or moon depending on current theme.
                  Click flips palette + saves to localStorage. */}
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="px-2 py-1 rounded flex items-center justify-center transition-transform hover:scale-110"
                style={{
                  color: '#fff',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(0,0,0,0.4)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                  minWidth: 28, minHeight: 24,
                }}
              >{theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}</button>
              {/* Discord invite — Discord-brand purple so it's instantly
                  recognizable. Opens in a new tab so people don't lose the site. */}
              <a
                href="https://discord.gg/XP5jjUp7t"
                target="_blank"
                rel="noopener noreferrer"
                title="Join the ASL Discord"
                className="px-2 py-1 rounded flex items-center gap-1 transition-transform hover:scale-105"
                style={{
                  fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 1.5,
                  color: '#fff', background: '#5865F2',
                  border: '1px solid rgba(0,0,0,0.4)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z"/>
                </svg>
                <span className="hidden sm:inline">DISCORD</span>
              </a>
              <button
                onClick={onLogout}
                className="px-2 py-1 rounded flex items-center gap-1"
                style={{
                  fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 1.5,
                  color: '#fff', background: 'rgba(168,36,58,0.7)',
                  border: '1px solid rgba(0,0,0,0.4)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                  textTransform: 'uppercase',
                }}
              ><LogOut size={11} /> EXIT</button>
            </div>
          </div>
        </div>

        {/* Gold scrolling news ticker (hides when there's no news) */}
        {tickerNews.length > 0 && (
          <div className="asl-ticker">
            <div className="asl-ticker-track">
              {[...tickerNews, ...tickerNews].map((n, i) => (
                <span key={i}>{n.title || n.body || 'NEWS'}</span>
              ))}
            </div>
          </div>
        )}

        {/* Navy nav bar with gold underline on active tab */}
        <div className="asl-nav-bar">
          <div className="max-w-6xl mx-auto px-3 flex gap-0 overflow-x-auto">
            {mainTabs.map(t => {
              const active = view === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setView(t.id); setMoreOpen(false); }}
                  className={`asl-nav-tab ${active ? 'active' : ''} flex items-center gap-1.5 whitespace-nowrap`}
                  style={{ padding: '11px 14px 9px', fontSize: 11 }}
                >
                  <t.icon size={12} /> {t.label}
                </button>
              );
            })}
            {/* MORE — overflow dropdown for reference/less-visited tabs.
                Uses fixed positioning (anchored to the button via ref) because
                the nav bar's overflow-x-auto would otherwise clip an absolute
                dropdown. */}
            <div className="relative">
              <button
                ref={moreBtnRef}
                onClick={() => {
                  if (!moreOpen && moreBtnRef.current) {
                    const r = moreBtnRef.current.getBoundingClientRect();
                    setMorePos({ top: r.bottom, right: window.innerWidth - r.right });
                  }
                  setMoreOpen(o => !o);
                }}
                className={`asl-nav-tab ${moreTabs.some(t => t.id === view) ? 'active' : ''} flex items-center gap-1.5 whitespace-nowrap`}
                style={{ padding: '11px 14px 9px', fontSize: 11 }}
              >
                MORE <ChevronRight size={12} style={{ transform: 'rotate(90deg)' }} />
              </button>
              {moreOpen && (
                <>
                  <div
                    className="fixed inset-0"
                    style={{ zIndex: 2_147_483_646 }}
                    onClick={() => setMoreOpen(false)}
                  />
                  <div
                    className="rounded shadow-lg overflow-hidden"
                    style={{
                      position: 'fixed',
                      top: morePos.top,
                      right: morePos.right,
                      zIndex: 2_147_483_647, minWidth: 200,
                      background: C.brandNavyDeep,
                      border: `1px solid ${C.navyLight}66`,
                      boxShadow: `0 8px 24px rgba(0,0,0,0.4)`,
                    }}
                  >
                    {moreTabs.map(t => {
                      const active = view === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => { setView(t.id); setMoreOpen(false); }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-left transition-colors"
                          style={{
                            background: active ? `${C.gold}33` : 'transparent',
                            color: active ? C.goldLight : C.white,
                            fontSize: 12,
                            fontFamily: 'Oswald, sans-serif',
                            letterSpacing: '0.1em',
                            borderBottom: `1px solid ${C.navyLight}22`,
                          }}
                        >
                          <t.icon size={14} /> {t.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
