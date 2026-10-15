import { BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { content as contentApi } from './api';
import type { Rule } from './models';
import { C } from '../../theme/theme';
import { renderRulesBody } from '../../utils/content';

// ============ RULES: public view ============
// Shows the full rulebook to any signed-in player. Sticky sidebar links to
// each section. Sections load fresh from the DB every time this view mounts
// so admins' edits are visible immediately.
export const RulesView = ({ onJump: _onJump }: { onJump: (view:string) => void }) => {
  const [sections, setSections] = useState<Rule[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => { try { const rows = await contentApi.listRulesSections(); if (alive) setSections(rows); } catch (error) { if (alive) setLoadError(error instanceof Error ? error.message : 'Could not load rules.'); } finally { if (alive) setLoading(false); } })();
    return () => { alive = false; };
  }, []);

  const scrollTo = (id: string | null | undefined) => {
    const el = document.querySelector(`#${CSS.escape(`rule-sec-${id}`)}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <BookOpen size={22} style={{ color: C.brandNavy }} />
        <h1 className="font-display text-2xl tracking-wider" style={{ color: C.brandNavyDeep, letterSpacing: '0.2em' }}>OFFICIAL ASL RULEBOOK</h1>
      </div>

      {loadError && <p role="alert">{loadError}</p>}
      {loading ? (
        <div className="font-mono text-sm py-8 text-center" style={{ color: `${C.brandNavy}77` }}>Loading rules...</div>
      ) : (sections.length === 0 ? (
        <div className="p-6 rounded text-center font-mono text-sm" style={{ background: `${C.brandNavy}0a`, border: `1px dashed ${C.brandNavy}44`, color: `${C.brandNavy}88` }}>
          The rulebook hasn't been published yet. Check back soon.
        </div>
      ) : (
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Table of contents — sticky on desktop */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-4 p-3 rounded" style={{ background: `${C.brandNavy}08`, border: `1px solid ${C.brandNavy}22` }}>
              <div className="font-heading tracking-wider text-xs mb-2" style={{ color: C.brandNavyDeep, letterSpacing: '0.2em' }}>CONTENTS</div>
              <ol className="space-y-1 font-mono text-[11px]">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <button
                      onClick={() => scrollTo(s.id)}
                      className="text-left hover:underline"
                      style={{ color: C.brandNavy }}
                    >{i + 1}. {s.title}</button>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          {/* The rulebook itself */}
          <main className="lg:col-span-3 space-y-6">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={`rule-sec-${s.id}`}
                className="p-4 rounded scroll-mt-4"
                style={{ background: C.white, border: `1px solid ${C.brandNavy}22` }}
              >
                <div className="flex items-baseline gap-2 mb-2 pb-2" style={{ borderBottom: `1px solid ${C.brandNavy}22` }}>
                  <div className="font-mono text-[10px] tracking-widest" style={{ color: `${C.brandNavy}66` }}>§ {i + 1}</div>
                  <h2 className="font-display text-xl tracking-wider" style={{ color: C.brandNavyDeep, letterSpacing: '0.15em' }}>{s.title.toUpperCase()}</h2>
                </div>
                <div>
                  {renderRulesBody(s.body)}
                </div>
              </section>
            ))}
          </main>
        </div>
      ))}
    </div>
  );
};

// ============ RULES: admin manager ============
// Create, edit, delete, and reorder rules sections. Uses a simple stack of
// cards (up/down arrows to reorder — no drag). Each card can expand into an
// editor with title + body textarea. Save persists to Supabase.
export const RulesManager = ({ onRefresh }: { onRefresh: () => void }) => {
  const [sections, setSections] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      setSections(await contentApi.listRulesSections());
      setMsg('');
      return true;
    }
    catch (error) {
      setMsg(error instanceof Error ? error.message : 'Could not load rules.');
      return false;
    }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const startNew = () => {
    const id = `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setEditingId(id);
    setEditTitle('');
    setEditBody('');
  };
  const startEdit = (s: Rule) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditBody(s.body || '');
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditBody('');
    setMsg('');
  };
  const saveEdit = async () => {
    setMsg('');
    const title = (editTitle || '').trim();
    if (!title) { setMsg('Title required'); return; }
    setBusy(true);
    try {
      const existing = sections.find(s => s.id === editingId);
      const sortOrder = existing ? existing.sortOrder : sections.length;
      await contentApi.saveRulesSection({ id: editingId || crypto.randomUUID(), title, body: editBody, sortOrder });
      if (await refresh()) {
        cancelEdit();
        onRefresh?.();
      }
    } catch (error) {
      setMsg('Save failed: ' + (error instanceof Error ? error.message : String(error)));
    }
    setBusy(false);
  };
  const removeSection = async (s: Rule) => {
    if (!confirm(`Delete "${s.title}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await contentApi.deleteRulesSection(s.id);
      await refresh();
      onRefresh?.();
    } catch (error) {
      alert('Delete failed: ' + (error instanceof Error ? error.message : String(error)));
    }
    setBusy(false);
  };
  const move = async (idx: number, dir: number) => {
    if (busy) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const reordered = [...sections];
    const previous = reordered[idx];
    reordered[idx] = reordered[newIdx];
    reordered[newIdx] = previous;
    setSections(reordered); // optimistic
    setBusy(true);
    try {
      await contentApi.reorderRulesSections(reordered.map(s => s.id));
      onRefresh?.();
    } catch (error) {
      alert('Reorder failed: ' + (error instanceof Error ? error.message : String(error)));
      setSections(sections);
    } finally {
      setBusy(false);
    }
  };

  

  return (
    <div className="space-y-4">
      <div className="p-3 rounded" style={{ background: `${C.goldLight}0a`, border: `1px solid ${C.goldLight}33` }}>
        <div className="font-mono text-[11px] leading-relaxed" style={{ color: `${C.cream}cc` }}>
          <b style={{ color: C.goldLight }}>Formatting:</b> use <code style={{ color: C.goldLight }}>## Heading</code>, <code style={{ color: C.goldLight }}>### Sub-heading</code>, <code style={{ color: C.goldLight }}>**bold**</code>, <code style={{ color: C.goldLight }}>*italic*</code>, <code style={{ color: C.goldLight }}>- bullet</code>, <code style={{ color: C.goldLight }}>1. numbered</code>, <code style={{ color: C.goldLight }}>[text](url)</code>. Blank line = new paragraph.
        </div>
      </div>

      <button
        onClick={startNew}
        disabled={editingId !== null}
        className="px-4 py-2 rounded font-heading tracking-wider text-xs disabled:opacity-40"
        style={{ background: C.goldLight, color: C.navyDeep }}
      >+ NEW SECTION</button>

      {loading ? (
        <div className="font-mono text-sm py-6 text-center" style={{ color: `${C.cream}55` }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {msg && !editingId && <div role="alert" className="font-mono text-xs" style={{ color: C.redLight }}>{msg}</div>}
          {editingId && sections.every(s => s.id !== editingId) && (
            <RulesEditor
              title={editTitle} setTitle={setEditTitle}
              body={editBody} setBody={setEditBody}
              onSave={saveEdit} onCancel={cancelEdit}
              busy={busy} msg={msg} isNew
            />
          )}
          {sections.map((s, idx) => (
            editingId === s.id ? (
              <RulesEditor
                key={s.id}
                title={editTitle} setTitle={setEditTitle}
                body={editBody} setBody={setEditBody}
                onSave={saveEdit} onCancel={cancelEdit}
                busy={busy} msg={msg}
              />
            ) : (
              <div key={s.id} className="p-3 rounded flex items-start gap-3" style={{ background: `${C.navyLight}15`, border: `1px solid ${C.navyLight}33` }}>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0 || editingId !== null || busy}
                    className="text-xs px-1.5 py-0.5 rounded disabled:opacity-30"
                    style={{ background: `${C.cream}11`, color: C.cream }}
                    aria-label="Move up"
                  >▲</button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === sections.length - 1 || editingId !== null || busy}
                    className="text-xs px-1.5 py-0.5 rounded disabled:opacity-30"
                    style={{ background: `${C.cream}11`, color: C.cream }}
                    aria-label="Move down"
                  >▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div className="font-mono text-[10px] tracking-widest" style={{ color: `${C.cream}66` }}>§ {idx + 1}</div>
                    <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>{s.title}</div>
                  </div>
                  <div className="font-mono text-[10px] mt-1" style={{ color: `${C.cream}55` }}>{(s.body || '').length} chars · updated {new Date(s.updatedAt).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(s)}
                    disabled={editingId !== null}
                    className="px-2 py-1 rounded font-heading text-[10px] tracking-wider disabled:opacity-40"
                    style={{ background: C.brandNavy, color: C.cream }}
                  >EDIT</button>
                  <button
                    onClick={() => removeSection(s)}
                    disabled={editingId !== null}
                    className="px-2 py-1 rounded font-heading text-[10px] tracking-wider disabled:opacity-40"
                    style={{ background: `${C.red}66`, color: C.cream }}
                  >DEL</button>
                </div>
              </div>
            )
          ))}
          {sections.length === 0 && !editingId && (
            <div className="p-6 rounded text-center font-mono text-sm" style={{ background: `${C.navyLight}0a`, border: `1px dashed ${C.navyLight}33`, color: `${C.cream}66` }}>
              No sections yet. Click NEW SECTION to add the first one.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Inline editor for a single rules section (used by RulesManager)
export const RulesEditor = ({ title, setTitle, body, setBody, onSave, onCancel, busy, msg, isNew }: { title: string; setTitle: (title:string) => void; body: string; setBody: (body:string) => void; onSave?: () => void; onCancel: () => void; busy: boolean; msg: string; isNew?: boolean }) => (
  <div className="p-3 rounded space-y-2" style={{ background: `${C.goldLight}0a`, border: `1px solid ${C.goldLight}55` }}>
    <div className="flex items-center gap-2">
      <div className="font-mono text-[10px] tracking-widest" style={{ color: C.goldLight }}>{isNew ? 'NEW SECTION' : 'EDITING'}</div>
    </div>
    <div>
      <div className="font-mono text-[9px] tracking-wider mb-0.5" style={{ color: `${C.cream}77` }}>TITLE</div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Competitive Integrity"
        className="w-full px-3 py-2 font-heading text-sm rounded focus:outline-none"
        style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66` }}
      />
    </div>
    <div>
      <div className="font-mono text-[9px] tracking-wider mb-0.5" style={{ color: `${C.cream}77` }}>BODY (markdown-lite)</div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`## Sub-heading\n\nParagraph text here.\n\n- Bullet point\n- Another bullet\n\n**Bold** and *italic* work inline.`}
        rows={12}
        className="w-full px-3 py-2 font-mono text-xs rounded focus:outline-none"
        style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66`, resize: 'vertical' }}
      />
    </div>
    {msg && <div className="font-mono text-[11px]" style={{ color: C.redLight }}>{msg}</div>}
    <div className="flex gap-2">
      <button
        onClick={onSave}
        disabled={busy}
        className="px-4 py-1.5 rounded font-heading tracking-wider text-xs disabled:opacity-50"
        style={{ background: C.greenLight, color: C.onColor }}
      >{busy ? 'SAVING...' : 'SAVE'}</button>
      <button
        onClick={onCancel}
        className="px-4 py-1.5 rounded font-heading tracking-wider text-xs"
        style={{ background: `${C.navyLight}33`, color: `${C.cream}88` }}
      >CANCEL</button>
    </div>
  </div>
);
