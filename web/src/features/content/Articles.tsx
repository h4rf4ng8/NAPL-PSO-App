import { BookOpen, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { content as contentApi } from './api';
import type { Account } from '../accounts/models';
import type { Article } from './models';
import { ModalShell } from '../../components/Ui';
import { C } from '../../theme/theme';
import { autoExcerpt, readTime, renderArticleBody, slugify } from '../../utils/content';
import { isAdmin } from '../../utils/league';
import { useResource } from '../../hooks/use-resource';

// Article compose/edit modal — admin only
const ArticleEditorModal = ({ article, onClose, onSaved }: { article?: Article | null; onClose: () => void; onSaved: () => void }) => {
  const isNew = !article;
  const [title, setTitle] = useState(article?.title || '');
  const [slug, setSlug] = useState(article?.slug || '');
  const [coverImageUrl, setCoverImageUrl] = useState(article?.coverImageUrl || '');
  const [body, setBody] = useState(article?.body || '');
  const [excerpt, setExcerpt] = useState(article?.excerpt || '');
  const [slugTouched, setSlugTouched] = useState(!!article);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // When the user types a title, auto-fill the slug — but stop auto-filling
  // once they manually edit the slug (so their custom slug isn't overwritten).
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  const handleSave = async () => {
    setErr('');
    if (!title.trim()) { setErr('Title is required.'); return; }
    if (!slug.trim()) { setErr('Slug is required.'); return; }
    if (!body.trim()) { setErr('Body cannot be empty.'); return; }
    setBusy(true);
    try {
      await contentApi.saveArticle({
        id: article?.id,
        publishedAt: article?.publishedAt,
        title: title.trim(),
        slug: slug.trim(),
        coverImageUrl: coverImageUrl.trim(),
        body,
        excerpt: excerpt.trim(),
      });
      onSaved?.();
      onClose?.();
    } catch (error) {
      setErr('Could not save: ' + (error instanceof Error ? error.message : String(error)));
      setBusy(false);
    }
  };

  return (
    <ModalShell title={isNew ? 'NEW ARTICLE' : 'EDIT ARTICLE'} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-3">
        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>TITLE *</label>
          <input
            type="text" value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Season 1 Opening Weekend Recap"
            className="w-full px-3 py-2 font-display tracking-wider rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream, fontSize: 20 }}
          />
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>URL SLUG *</label>
          <input
            type="text" value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
            placeholder="season-1-opening-weekend-recap"
            className="w-full px-3 py-2 font-mono text-sm rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
          <div className="font-mono text-[9px] mt-0.5" style={{ color: `${C.cream}66` }}>
            → /articles/{slug || 'your-slug'}
          </div>
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>COVER IMAGE URL</label>
          <input
            type="url" value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="https://... (external URL to the hero image)"
            className="w-full px-3 py-2 font-mono text-xs rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
          <div className="font-mono text-[9px] mt-0.5" style={{ color: `${C.cream}66` }}>
            Optional. Hosted somewhere accessible (Discord CDN, Imgur, etc.).
          </div>
          {coverImageUrl && (
            <img src={coverImageUrl} alt="Cover preview" className="mt-2 rounded max-h-32 object-cover"
              style={{ border: `1px solid ${C.navyLight}66` }} />
          )}
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>
            EXCERPT (OPTIONAL — AUTO FROM BODY IF BLANK)
          </label>
          <input
            type="text" value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="One-sentence preview shown on the articles list card"
            className="w-full px-3 py-2 font-body text-sm rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>
            BODY (MARKDOWN-LITE) *
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`## Heading\n\nParagraph with **bold** and *italic* text.\n\n- Bullet point\n- Another point\n\n### Sub-heading\n\nMore content.`}
            rows={14}
            className="w-full px-3 py-2 font-mono text-sm rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <div className="font-mono text-[9px] mt-0.5" style={{ color: `${C.cream}66` }}>
            Supports: ## heading, ### sub-heading, **bold**, *italic*, - bullets, 1. numbered lists, [link text](url), `code`.
          </div>
        </div>

        {err && <div className="font-mono text-xs p-2 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{err}</div>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={busy}
            className="flex-1 py-2 font-heading tracking-wider text-sm rounded disabled:opacity-50"
            style={{ background: C.green, color: C.onColor }}
          >{busy ? 'SAVING...' : (isNew ? 'PUBLISH ARTICLE' : 'SAVE CHANGES')}</button>
          <button
            onClick={onClose}
            className="px-4 py-2 font-heading tracking-wider text-sm rounded"
            style={{ background: `${C.navyLight}44`, color: `${C.cream}cc` }}
          >CANCEL</button>
        </div>
      </div>
    </ModalShell>
  );
};

// Article detail — full-width hero image, title, metadata, body
export const ArticleDetailView = ({ slug, account, onBack }: { slug: string; account: Account | null; onBack: () => void }) => {
  const { data: article = null, loading, error, reload: refresh } = useResource(() => contentApi.getArticleBySlug(slug), [slug]);
  const [editing, setEditing] = useState(false);
  const isAdminUser = isAdmin(account);

  const handleDelete = async () => {
    if (!article || !confirm(`Delete this article permanently?`)) return;
    try { await contentApi.deleteArticle(article.id); onBack?.(); }
    catch (error) { alert('Could not delete: ' + (error instanceof Error ? error.message : String(error))); }
  };

  if (loading) {
    return <div className="text-center py-10 font-mono text-sm" style={{ color: `${C.brandNavy}77` }}>Loading article...</div>;
  }
  if (error) {
    return <div role="alert" className="text-center py-10 font-mono text-sm" style={{ color: C.redLight }}>{error}</div>;
  }
  if (!article) {
    return (
      <div className="text-center py-10">
        <div className="font-display text-2xl mb-2" style={{ color: C.brandNavy }}>ARTICLE NOT FOUND</div>
        <button onClick={onBack} className="font-mono text-xs underline tracking-wider" style={{ color: C.brandNavy }}>
          ← back to articles
        </button>
      </div>
    );
  }
  const pub = new Date(article.publishedAt || 0);
  const pubStr = pub.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div>
      <button onClick={onBack} className="mb-4 font-mono text-xs tracking-widest flex items-center gap-1" style={{ color: C.brandNavy }}>
        ← ALL ARTICLES
      </button>

      {article.coverImageUrl && (
        // Container hugs the actual image (fit-content width) so a portrait
        // image gets a portrait-shaped frame and a landscape one gets a
        // landscape frame — no dead space on the sides. Centered in the
        // column via the outer wrapper.
        <div className="mb-6 flex justify-center">
          <div className="rounded-xl overflow-hidden inline-block" style={{
            border: `1px solid ${C.navyLight}66`,
            boxShadow: `0 4px 24px ${C.brandNavy}22`,
            background: C.brandNavyDeep,
            maxWidth: '100%',
          }}>
            <img
              src={article.coverImageUrl}
              alt={article.title}
              style={{
                display: 'block',
                maxHeight: 540,
                maxWidth: '100%',
                width: 'auto',
                height: 'auto',
              }}
            />
          </div>
        </div>
      )}

      <h1 className="font-display tracking-wider mb-3" style={{
        color: C.brandNavyDeep, fontSize: 42, lineHeight: 1.1, letterSpacing: '0.02em',
      }}>
        {article.title}
      </h1>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-5 pb-4" style={{ borderBottom: `1px solid ${C.navyLight}66` }}>
        <div className="font-mono text-xs tracking-widest flex items-center gap-2" style={{ color: `${C.brandNavy}cc` }}>
          <span style={{ color: C.goldLight }}>BY</span>
          <span style={{ color: C.cream, fontWeight: 600 }}>{(article.author || '').toUpperCase()}</span>
          <span>•</span>
          <span>{pubStr}</span>
          <span>•</span>
          <span>{readTime(article.body)} MIN READ</span>
        </div>
        {isAdminUser && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)}
              className="px-3 py-1 font-mono text-[10px] tracking-widest rounded"
              style={{ background: `${C.navyLight}66`, color: C.brandNavy }}
            >EDIT</button>
            <button onClick={handleDelete}
              className="px-3 py-1 font-mono text-[10px] tracking-widest rounded"
              style={{ background: `${C.red}33`, color: C.redLight }}
            >DELETE</button>
          </div>
        )}
      </div>

      <div className="font-body" style={{ color: C.brandNavy }}>
        {renderArticleBody(article.body)}
      </div>

      {editing && (
        <ArticleEditorModal
          article={article}
          onClose={() => setEditing(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
};

// Articles list — card grid
export const ArticlesListView = ({ account, onOpenArticle }: { account: Account | null; onOpenArticle: (slug:string) => void }) => {
  const { data: articles = [], loading, error, reload: refresh } = useResource(() => contentApi.listArticles(), []);
  const [composing, setComposing] = useState(false);
  const isAdminUser = isAdmin(account);

  const fmtDate = (ms: number | null | undefined) => {
    return ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <BookOpen size={20} style={{ color: C.brandNavy }} />
          <h2 className="font-display tracking-widest" style={{ color: C.brandNavyDeep, fontSize: 22, letterSpacing: '0.2em' }}>
            FEATURE ARTICLES
          </h2>
        </div>
        {isAdminUser && (
          <button
            onClick={() => setComposing(true)}
            className="px-3 py-1.5 font-heading tracking-wider text-xs rounded flex items-center gap-1.5"
            style={{ background: C.green, color: C.onColor }}
          ><Plus size={12} /> NEW ARTICLE</button>
        )}
      </div>

      {loading && <div className="text-center py-8 font-mono text-sm" style={{ color: `${C.brandNavy}77` }}>Loading articles...</div>}
      {!loading && error && <div role="alert" className="text-center py-8 font-mono text-sm" style={{ color: C.redLight }}>{error}</div>}
      {!loading && !error && articles.length === 0 && (
        <div className="text-center py-10 font-mono text-sm rounded" style={{
          color: `${C.brandNavy}77`, background: `${C.navyLight}11`, border: `1px dashed ${C.navyLight}66`,
        }}>
          No articles yet. {isAdminUser ? 'Click NEW ARTICLE to publish the first one.' : 'Admins will post longer-form articles here.'}
        </div>
      )}
      {!loading && !error && articles.length > 0 && (
        // Horizontal article cards — image on the left, headline + preview on
        // the right. Reads like a magazine/newspaper article list. Each card
        // is a button, clicking anywhere opens the full article.
        <div className="space-y-3">
          {articles.map(a => (
            <button key={a.id}
              onClick={() => onOpenArticle(a.slug)}
              className="w-full text-left rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
              style={{
                background: C.white,
                border: `1px solid ${C.navyLight}66`,
                boxShadow: `0 2px 8px ${C.brandNavy}11, 0 6px 16px ${C.brandNavy}0a`,
              }}
            >
              <div className="flex items-stretch gap-0" style={{ minHeight: 150 }}>
                {/* Left: cover image (or placeholder) */}
                {a.coverImageUrl ? (
                  <img src={a.coverImageUrl} alt={a.title}
                    className="object-cover shrink-0"
                    style={{ width: 200, alignSelf: 'stretch' }} />
                ) : (
                  <div className="shrink-0 flex items-center justify-center" style={{
                    width: 200, alignSelf: 'stretch',
                    background: `linear-gradient(135deg, ${C.brandNavy} 0%, ${C.brandNavyDeep} 100%)`,
                  }}>
                    <BookOpen size={44} style={{ color: `${C.goldLight}99` }} />
                  </div>
                )}
                {/* Right: title + excerpt + metadata */}
                <div className="flex-1 p-5 flex flex-col justify-between min-w-0">
                  <div>
                    <h3 className="font-display tracking-wider mb-2" style={{
                      color: C.brandNavyDeep, fontSize: 24, lineHeight: 1.15, letterSpacing: '0.02em',
                    }}>
                      {a.title}
                    </h3>
                    <p className="font-body" style={{
                      color: `${C.cream}cc`, fontSize: 14, lineHeight: 1.55,
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {a.excerpt || autoExcerpt(a.body, 220)}
                    </p>
                  </div>
                  <div className="font-mono text-[10px] tracking-widest flex items-center gap-2 mt-3 flex-wrap" style={{ color: `${C.brandNavy}99` }}>
                    <span style={{ color: C.goldLight, fontWeight: 700 }}>{(a.author || '').toUpperCase()}</span>
                    <span>•</span>
                    <span>{fmtDate(a.publishedAt)}</span>
                    <span>•</span>
                    <span>{readTime(a.body)} MIN READ</span>
                    <span className="ml-auto flex items-center gap-1" style={{ color: C.brandNavy }}>
                      READ <ChevronRight size={10} />
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {composing && (
        <ArticleEditorModal
          onClose={() => setComposing(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
};
