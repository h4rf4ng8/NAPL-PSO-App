import { ArticleDetailView, ArticlesListView } from './Articles';
import { Calendar, Flag, Plus, Star, Trophy } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { content as contentApi } from './api';
import type { Account } from '../accounts/models';
import type { News } from './models';
import type { Team } from '../teams/models';
import { EmptyState, ModalShell, TeamPill } from '../../components/Ui';
import { C } from '../../theme/theme';
import { isAdmin } from '../../utils/league';
import { useResource } from '../../hooks/use-resource';

// ============ NEWS VIEW ============
// ============ NEWS HUB (news + articles sub-navigation) ============
// Wraps the three sub-views that share the NEWS tab:
//   - News feed (default)
//   - Articles list
//   - Article detail (opened by slug)
// Sub-nav uses URL paths /news, /articles, /articles/<slug> so sub-tabs are
// shareable and browser back/forward works naturally.
export const NewsHub = ({ account, allTeams }: { account: Account | null; allTeams: Team[]; }) => {
  // Detect sub-view from hash (hash routing — see Dashboard for context).
  const readPath = () => {
    const h = location.hash || '';
    if (!h || h === '#') return '/';
    const stripped = h.startsWith('#/') ? h.slice(1) : h.slice(1);
    return stripped.replace(/\/+$/, '') || '/';
  };
  const detect = () => {
    const path = readPath();
    if (path === '/articles') return { sub: 'articles', slug: null };
    const m = path.match(/^\/articles\/([^/]+)$/);
    return m ? { sub: 'articles', slug: m[1] } : { sub: 'news', slug: null };
  };
  const [state, setState] = useState(detect);

  // Keep sub-state in sync when the hash changes (back/forward, nav clicks, etc.)
  useEffect(() => {
    const onHash = () => setState(detect());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const goTo = (sub: string, slug: string | null = null) => {
    const path = sub === 'news' ? '/news'
      : (slug ? `/articles/${slug}`
      : '/articles');
    const newHash = '#' + path;
    if (location.hash !== newHash) {
      location.hash = newHash;
    }
    setState({ sub, slug });
  };

  return (
    <div>
      {/* Sub-tab navigation — only shown when NOT reading a specific article
          (article detail has its own back button so sub-nav would be noise). */}
      {!state.slug && (
        <div className="mb-5 flex gap-1 rounded p-1 w-fit" style={{ background: `${C.navyLight}66` }}>
          <button
            onClick={() => goTo('news')}
            className="px-4 py-1.5 font-heading tracking-widest text-xs rounded"
            style={state.sub === 'news'
              ? { background: C.brandNavy, color: C.onColor }
              : { color: C.brandNavy }
            }
          >NEWS</button>
          <button
            onClick={() => goTo('articles')}
            className="px-4 py-1.5 font-heading tracking-widest text-xs rounded"
            style={state.sub === 'articles'
              ? { background: C.brandNavy, color: C.onColor }
              : { color: C.brandNavy }
            }
          >ARTICLES</button>
        </div>
      )}

      {state.sub === 'news' && (
        <NewsView account={account} allTeams={allTeams} />
      )}
      {state.sub === 'articles' && !state.slug && (
        <ArticlesListView account={account} onOpenArticle={(slug) => goTo('articles', slug)} />
      )}
      {state.sub === 'articles' && state.slug && (
        <ArticleDetailView
          slug={state.slug}
          account={account}
          onBack={() => goTo('articles')}
        />
      )}
    </div>
  );
};

const NewsView = ({ account, allTeams }: { account: Account | null; allTeams: Team[]; }) => {
  const [subtab, setSubtab] = useState('matchups');
  const { data: news = [], loading, error, reload: refresh } = useResource(() => contentApi.listNews(), []);
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState<News | null>(null);

  const teamById = (id: string | null | undefined) => allTeams.find(t => t.id === id);

  const matchups     = news.filter(n => n.type === 'matchup').sort((a, b) => (a.date || 0) - (b.date || 0));
  const announcements = news.filter(n => n.type === 'announcement').sort((a, b) => {
    return a.pinned === b.pinned ? b.createdAt - a.createdAt : Number(b.pinned) - Number(a.pinned);
  });
  const results      = news.filter(n => n.type === 'result').sort((a, b) => (b.date || 0) - (a.date || 0));

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this news item?')) return;
    try {
      await contentApi.deleteNews(id);
      await refresh();
    } catch (deleteError) {
      alert('Could not delete: ' + (deleteError instanceof Error ? deleteError.message : String(deleteError)));
    }
  };
  const handleEdit = (item: News) => {
    setEditing(item);
    setShowCompose(true);
  };

  const isAdminUser = isAdmin(account);

  const subtabs = [
    { id: 'matchups',      label: `MATCHUPS (${matchups.length})`,           icon: Calendar },
    { id: 'announcements', label: `ANNOUNCEMENTS (${announcements.length})`, icon: Flag },
    { id: 'results',       label: `RESULTS (${results.length})`,             icon: Trophy },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Flag size={22} style={{ color: C.goldLight }} />
          <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>NEWS</h3>
        </div>
        {isAdminUser && (
          <button
            onClick={() => { setEditing(null); setShowCompose(true); }}
            className="px-3 py-1.5 font-heading tracking-wider text-xs flex items-center gap-1.5 rounded transition-all hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor, boxShadow: `0 2px 8px ${C.green}66`,
            }}
          ><Plus size={12} /> NEW POST</button>
        )}
      </div>

      {/* SUBTABS */}
      <div className="flex gap-1 mb-5 p-1 rounded" style={{ background: `${C.navyDeep}88` }}>
        {subtabs.map(s => {
          const active = subtab === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSubtab(s.id)}
              className="flex-1 px-3 py-2 font-heading tracking-wider text-[10px] sm:text-[11px] rounded transition-all flex items-center justify-center gap-1.5"
              style={{
                background: active ? `${C.goldLight}22` : 'transparent',
                color: active ? C.goldLight : `${C.cream}88`,
                border: `1px solid ${active ? C.goldLight : 'transparent'}66`,
              }}
            ><s.icon size={12} /> {s.label}</button>
          );
        })}
      </div>

      {error && <div role="alert" className="mb-4 font-mono text-xs" style={{ color: C.redLight }}>{error}</div>}
      {loading && <div className="mb-4 font-mono text-xs" style={{ color: `${C.cream}66` }}>Loading news...</div>}

      {/* MATCHUPS */}
      {subtab === 'matchups' && (
        matchups.length === 0
          ? <EmptyState icon={<Calendar size={40} />} text="No matchups posted yet." />
          : <div className="space-y-2">
              {matchups.map(m => {
                const home = teamById(m.homeTeamId);
                const away = teamById(m.awayTeamId);
                const upcoming = (m.date || 0) >= Date.now();
                return (
                  <div key={m.id} className="rounded-lg p-4" style={{
                    background: `${C.navyDeep}aa`,
                    border: `1px solid ${C.navyLight}44`,
                    borderLeft: `3px solid ${upcoming ? C.greenLight : C.navyLight}`,
                  }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="font-mono text-[10px] tracking-[0.25em] mb-1" style={{ color: upcoming ? C.greenLight : `${C.cream}66` }}>
                          {upcoming ? 'UPCOMING' : 'PAST'} • {new Date(m.date || 0).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {new Date(m.date || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <TeamPill team={home} fallback={m.homeTeamId} />
                          <span className="font-display text-xl" style={{ color: `${C.cream}77` }}>VS</span>
                          <TeamPill team={away} fallback={m.awayTeamId} />
                        </div>
                        {m.notes && <p className="font-body text-sm mt-2" style={{ color: `${C.cream}cc` }}>{m.notes}</p>}
                      </div>
                      {isAdminUser && (
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(m)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.navyLight}66`, color: C.cream }}>EDIT</button>
                          <button onClick={() => handleDelete(m.id)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.red}33`, color: C.redLight }}>DEL</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
      )}

      {/* ANNOUNCEMENTS */}
      {subtab === 'announcements' && (
        announcements.length === 0
          ? <EmptyState icon={<Flag size={40} />} text="No announcements yet." />
          : <div className="space-y-2">
              {announcements.map(a => (
                <div key={a.id} className="rounded-lg p-4" style={{
                  background: a.pinned ? `${C.gold}11` : `${C.navyDeep}aa`,
                  border: `1px solid ${a.pinned ? C.gold + '66' : C.navyLight + '44'}`,
                  borderLeft: `3px solid ${a.pinned ? C.goldLight : C.brandNavy}`,
                }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {a.pinned && <Star size={12} style={{ color: C.goldLight }} />}
                        <span className="font-display text-xl tracking-wider" style={{ color: C.cream }}>{a.title}</span>
                      </div>
                      <p className="font-body text-sm whitespace-pre-wrap" style={{ color: `${C.cream}dd` }}>{a.body}</p>
                      <div className="font-mono text-[10px] tracking-wider mt-2" style={{ color: `${C.cream}55` }}>
                        BY {(a.author || 'admin').toUpperCase()} • {new Date(a.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {isAdminUser && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => handleEdit(a)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.navyLight}66`, color: C.cream }}>EDIT</button>
                        <button onClick={() => handleDelete(a.id)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.red}33`, color: C.redLight }}>DEL</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* RESULTS */}
      {subtab === 'results' && (
        results.length === 0
          ? <EmptyState icon={<Trophy size={40} />} text="No results posted yet." />
          : <div className="space-y-2">
              {results.map(r => {
                const home = teamById(r.homeTeamId);
                const away = teamById(r.awayTeamId);
                const homeWon = (r.homeScore || 0) > (r.awayScore || 0);
                const awayWon = (r.awayScore || 0) > (r.homeScore || 0);
                return (
                  <div key={r.id} className="rounded-lg p-4" style={{
                    background: `${C.navyDeep}aa`,
                    border: `1px solid ${C.navyLight}44`,
                    borderLeft: `3px solid ${C.goldLight}`,
                  }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1">
                        <div className="font-mono text-[10px] tracking-[0.25em] mb-2 flex items-center gap-2" style={{ color: `${C.cream}66` }}>
                          {new Date(r.date || 0).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          {r.autoFromSubmission && (
                            <span className="px-1.5 py-0.5 rounded" style={{
                              background: `${C.greenLight}22`, color: C.greenLight, letterSpacing: '0.15em',
                            }}>FROM STATS</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <TeamPill team={home} fallback={r.homeTeamId} dimmed={!homeWon && r.homeScore !== r.awayScore} />
                            <span className="font-display text-3xl" style={{ color: homeWon ? C.goldLight : C.cream }}>{r.homeScore}</span>
                          </div>
                          <span className="font-mono text-xs" style={{ color: `${C.cream}66` }}>—</span>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-3xl" style={{ color: awayWon ? C.goldLight : C.cream }}>{r.awayScore}</span>
                            <TeamPill team={away} fallback={r.awayTeamId} dimmed={!awayWon && r.homeScore !== r.awayScore} />
                          </div>
                        </div>
                        {r.notes && <p className="font-body text-sm mt-2" style={{ color: `${C.cream}cc` }}>{r.notes}</p>}
                      </div>
                      {isAdminUser && (
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(r)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.navyLight}66`, color: C.cream }}>EDIT</button>
                          <button onClick={() => handleDelete(r.id)} className="px-2 py-1 font-mono text-[9px] tracking-wider rounded" style={{ background: `${C.red}33`, color: C.redLight }}>DEL</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
      )}

      {showCompose && (
        <NewsComposeModal
          existing={editing}
          defaultType={subtab === 'announcements' ? 'announcement' : (subtab === 'results' ? 'result' : 'matchup')}
          allTeams={allTeams}
          onClose={() => { setShowCompose(false); setEditing(null); }}
          onSave={() => { setShowCompose(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
};

const NewsComposeModal = ({ existing, defaultType, allTeams, onClose, onSave }: { existing?: News | null; defaultType: string; allTeams: Team[]; onClose: () => void; onSave?: () => void }) => {
  const isEdit = !!existing;
  const [type, setType] = useState(existing?.type || defaultType);
  const [title, setTitle] = useState(existing?.title || '');
  const [body, setBody] = useState(existing?.body || '');
  const [pinned, setPinned] = useState(existing?.pinned || false);
  const [homeTeamId, setHomeTeamId] = useState(existing?.homeTeamId || '');
  const [awayTeamId, setAwayTeamId] = useState(existing?.awayTeamId || '');
  const [homeScore, setHomeScore] = useState(existing?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(existing?.awayScore ?? 0);
  const [date, setDate] = useState(() => {
    const d = existing?.date ? new Date(existing.date) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [notes, setNotes] = useState(existing?.notes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const approvedTeams = allTeams.filter(t => t.status === 'approved');

  const save = async () => {
    setError('');
    const id = existing?.id || `n_${Math.random().toString(36).slice(2, 10)}`;
    const base = {
      id, type,
    };
    let item;
    if (type === 'announcement') {
      if (!title.trim()) { setError('Title is required'); return; }
      if (!body.trim()) { setError('Body is required'); return; }
      item = { ...base, title: title.trim(), body: body.trim(), pinned };
    } else if (type === 'matchup') {
      if (!homeTeamId || !awayTeamId) { setError('Pick both teams'); return; }
      if (homeTeamId === awayTeamId) { setError('Teams must be different'); return; }
      item = { ...base, homeTeamId, awayTeamId, date: new Date(date || 0).getTime(), notes: notes.trim() };
    } else {
      if (!homeTeamId || !awayTeamId) { setError('Pick both teams'); return; }
      if (homeTeamId === awayTeamId) { setError('Teams must be different'); return; }
      item = { ...base, homeTeamId, awayTeamId, date: new Date(date || 0).getTime(),
               homeScore: Number(homeScore) || 0, awayScore: Number(awayScore) || 0,
               notes: notes.trim() };
    }
    setSaving(true);
    try {
      await contentApi.saveNews(item);
      onSave?.();
    } catch (saveError) {
      setError('Could not save: ' + (saveError instanceof Error ? saveError.message : String(saveError)));
    } finally {
      setSaving(false);
    }
  };

  const Lbl = ({ children }: { children: React.ReactNode }) => <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{children}</label>;
  const inputStyle = { background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream };

  return (
    <ModalShell onClose={onClose} title={isEdit ? 'EDIT NEWS' : 'NEW NEWS POST'} maxWidth="max-w-lg">
      {/* Type picker (only when creating new) */}
      {!isEdit && (
        <div className="flex gap-1 mb-4 p-1 rounded" style={{ background: `${C.navyDeep}88` }}>
          {[
            { id: 'matchup', label: 'MATCHUP' },
            { id: 'announcement', label: 'ANNOUNCEMENT' },
            { id: 'result', label: 'RESULT' },
          ].map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className="flex-1 py-1.5 font-heading tracking-wider text-[10px] rounded"
              style={{
                background: type === t.id ? `${C.goldLight}22` : 'transparent',
                color: type === t.id ? C.goldLight : `${C.cream}88`,
                border: `1px solid ${type === t.id ? C.goldLight : 'transparent'}66`,
              }}>{t.label}</button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {type === 'announcement' && (
          <>
            <div>
              <Lbl>TITLE</Lbl>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded px-3 py-2" style={inputStyle} placeholder="Season 2 has begun!" />
            </div>
            <div>
              <Lbl>BODY</Lbl>
              <textarea value={body} onChange={(e) => setBody(e.target.value)}
                rows={5} className="w-full rounded px-3 py-2 resize-none" style={inputStyle}
                placeholder="Write your announcement here..." />
            </div>
            <label className="flex items-center gap-2 font-mono text-xs cursor-pointer" style={{ color: C.cream }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <span>📌 PIN TO TOP</span>
            </label>
          </>
        )}

        {(type === 'matchup' || type === 'result') && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Lbl>HOME TEAM</Lbl>
                <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}
                  className="w-full rounded px-3 py-2" style={inputStyle}>
                  <option value="" style={{ background: C.navyDeep }}>— select —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <Lbl>AWAY TEAM</Lbl>
                <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}
                  className="w-full rounded px-3 py-2" style={inputStyle}>
                  <option value="" style={{ background: C.navyDeep }}>— select —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Lbl>{type === 'matchup' ? 'KICKOFF DATE & TIME' : 'MATCH DATE'}</Lbl>
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded px-3 py-2" style={inputStyle} />
            </div>
            {type === 'result' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Lbl>HOME SCORE</Lbl>
                  <input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(Number(e.target.value))}
                    className="w-full rounded px-3 py-2" style={inputStyle} />
                </div>
                <div>
                  <Lbl>AWAY SCORE</Lbl>
                  <input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(Number(e.target.value))}
                    className="w-full rounded px-3 py-2" style={inputStyle} />
                </div>
              </div>
            )}
            <div>
              <Lbl>NOTES (OPTIONAL)</Lbl>
              <input value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded px-3 py-2" style={inputStyle} placeholder="Featured match, late equalizer, etc." />
            </div>
          </>
        )}

        {error && <div className="font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-2.5 font-heading tracking-wider text-sm rounded mt-2"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor, boxShadow: `0 2px 8px ${C.green}66`,
          }}
        >{saving ? 'SAVING...' : (isEdit ? 'SAVE CHANGES' : 'POST')}</button>
      </div>
    </ModalShell>
  );
};
