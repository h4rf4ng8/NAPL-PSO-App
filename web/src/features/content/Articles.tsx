import { uploadImage } from '../../api/media';
import { MediaImage, mediaUrl } from '../../components/MediaImage';
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { content as contentApi } from './api';
import type { Account } from '../accounts/models';
import type { Article, ArticleSummary } from './models';
import { ModalShell } from '../../components/Dialog';
import { compressImage, fetchImageFile } from '../../utils/input';
import { readTime, renderArticleBody, slugify } from '../../utils/content';
import { isAdmin } from '../../utils/league';
import { useResource } from '../../hooks/use-resource';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { LazyText } from './LazyText';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { AspectRatio } from '../../components/ui/aspect-ratio';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

const ArticleEditorModal = ({ article, onClose, onSaved }: { article?: Article | null; onClose: () => void; onSaved: () => void }) => {
  const [title, setTitle] = useState(article?.title || '');
  const [slug, setSlug] = useState(article?.slug || '');
  const [coverImageUrl, setCoverImageUrl] = useState(article?.coverImageUrl || '');
  const [importUrl, setImportUrl] = useState('');
  const [body, setBody] = useState(article?.body || '');
  const [excerpt, setExcerpt] = useState(article?.excerpt || '');
  const [slugTouched, setSlugTouched] = useState(!!article);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!slugTouched) setSlug(slugify(title)); }, [title, slugTouched]);
  const prepareCover = async (file: File) => {
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
    setCoverImageUrl(await compressImage(file, 1600, 0.85));
  };
  const importCover = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await prepareCover(await fetchImageFile(importUrl)); setImportUrl(''); }
    catch { setError('Could not import this image. Download it and choose the image file instead.'); }
    finally { setBusy(false); }
  };
  const handleSave = async () => {
    if (busy) return;
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!slug.trim()) { setError('Slug is required.'); return; }
    if (!body.trim()) { setError('Body cannot be empty.'); return; }
    setBusy(true);
    try {
      const id = article?.id ?? slug.trim();
      const cover = coverImageUrl && coverImageUrl !== (article?.coverImageUrl ?? '') ? await uploadImage('article-cover', id, coverImageUrl) : coverImageUrl;
      await contentApi.saveArticle({ id, publishedAt: article?.publishedAt, title: title.trim(), slug: slug.trim(), ...(coverImageUrl.trim() !== article?.coverImageUrl && { coverImageUrl: cover }), body, excerpt: excerpt.trim() });
    } catch (error) { setError('Could not save: ' + (error instanceof Error ? error.message : String(error))); setBusy(false); return; }
    toast.success(article ? 'Article saved.' : 'Article published.'); onClose(); onSaved();
  };
  return <ModalShell title={article ? 'Edit article' : 'New article'} onClose={onClose} maxWidth="max-w-3xl"><form className="space-y-5" onSubmit={event => { event.preventDefault(); void handleSave(); }}>
    <div className="space-y-2"><Label htmlFor="article-title">Title</Label><Input id="article-title" value={title} onChange={event => setTitle(event.target.value)} disabled={busy} placeholder="Season opening weekend recap" /></div>
    <div className="space-y-2"><Label htmlFor="article-slug">URL slug</Label><Input id="article-slug" value={slug} onChange={event => { setSlug(event.target.value); setSlugTouched(true); }} disabled={busy} aria-describedby="article-slug-help" /><p id="article-slug-help" className="break-all text-sm text-muted-foreground">/articles/{slug || 'your-slug'}</p></div>
    <Card><CardHeader><CardTitle className="text-lg">Cover image</CardTitle><CardDescription>Choose an image or import one from a URL.</CardDescription></CardHeader><CardContent className="space-y-3">
      {coverImageUrl && <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg bg-muted"><MediaImage src={mediaUrl(coverImageUrl)} alt="Cover preview" className="h-full w-full object-contain" /></AspectRatio>}
      <div className="space-y-2"><Label htmlFor="article-cover">Choose cover image</Label><Input id="article-cover" type="file" accept="image/*" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(''); void prepareCover(file).catch((error: unknown) => { setError(error instanceof Error ? error.message : 'Could not process cover image.'); }).finally(() => setBusy(false)); }} /></div>
      <div className="space-y-2"><Label htmlFor="article-cover-url">Image URL to import</Label><Input id="article-cover-url" type="url" value={importUrl} onChange={event => setImportUrl(event.target.value)} disabled={busy} placeholder="https://…" /></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { void importCover(); }} disabled={busy || !importUrl}>Import cover image</Button>{coverImageUrl && <Button variant="outline" onClick={() => setCoverImageUrl('')} disabled={busy}>Remove cover image</Button>}</div>
    </CardContent></Card>
    <div className="space-y-2"><Label htmlFor="article-excerpt">Excerpt (optional)</Label><Textarea id="article-excerpt" rows={2} value={excerpt} onChange={event => setExcerpt(event.target.value)} disabled={busy} aria-describedby="article-excerpt-help" /><p id="article-excerpt-help" className="text-sm text-muted-foreground">A short preview for the article list. Leave blank to generate it from the body.</p></div>
    <Tabs defaultValue="write"><TabsList aria-label="Article editor mode"><TabsTrigger value="write">Write</TabsTrigger><TabsTrigger value="preview">Preview</TabsTrigger></TabsList><TabsContent value="write" className="space-y-2"><Label htmlFor="article-body">Body</Label><Textarea id="article-body" rows={14} value={body} onChange={event => setBody(event.target.value)} disabled={busy} aria-describedby="article-format" /><p id="article-format" className="text-sm text-muted-foreground">Use ## headings, ### subheadings, **bold**, *italic*, - bullets, 1. numbered lists, [text](url), and `code`.</p></TabsContent><TabsContent value="preview" className="min-h-40 break-words rounded-lg border p-4">{body ? renderArticleBody(body) : <p className="text-muted-foreground">Your article preview will appear here.</p>}</TabsContent></Tabs>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : (article ? 'Save changes' : 'Publish article')}</Button><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
  </form></ModalShell>;
};

export const ArticleDetailView = ({ slug, account, onBack }: { slug: string; account: Account | null; onBack: () => void }) => {
  const { data: article = null, loading, error, reload: refresh } = useResource(() => contentApi.getArticleBySlug(slug), [slug]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const handleDelete = async () => {
    if (!article || busy) return;
    setBusy(true); setDeleteError('');
    try { await contentApi.deleteArticle(article.id); }
    catch (error) { setDeleteError('Could not delete: ' + (error instanceof Error ? error.message : String(error))); setBusy(false); return; }
    toast.success('Article deleted.'); onBack();
  };
  return <article className="mx-auto max-w-3xl space-y-6">
    <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 size-4" />All articles</Button>
    {loading && <div role="status" className="space-y-4"><span className="sr-only">Loading article…</span><Skeleton className="h-48" /><Skeleton className="h-8 w-3/4" /></div>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" onClick={() => { void refresh(); }}>Try again</Button></AlertDescription></Alert>}
    {!loading && !error && !article && <Card><CardHeader><CardTitle>Article not found</CardTitle><CardDescription>The article may have moved or been removed.</CardDescription></CardHeader></Card>}
    {article && <>
      {article.coverImageUrl && <MediaImage src={mediaUrl(article.coverImageUrl)} alt={article.title} className="mx-auto max-h-[34rem] w-auto rounded-lg border object-contain" />}
      <header className="space-y-4 border-b pb-5"><h2 className="break-words text-3xl font-semibold leading-tight">{article.title}</h2><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"><span>By {article.author || 'League staff'}</span><time>{new Date(article.publishedAt || 0).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</time><span>{readTime(article.body)} min read</span></div>{isAdmin(account) && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditing(true)}>Edit article</Button><Button variant="destructive" onClick={() => { setDeleteError(''); setDeleting(true); }}>Delete article</Button></div>}</header>
      <div className="break-words">{renderArticleBody(article.body)}</div>
      {editing && <ArticleEditorModal article={article} onClose={() => setEditing(false)} onSaved={() => { void refresh(); }} />}
    </>}
    <AlertDialog open={deleting} onOpenChange={open => { if (!busy) setDeleting(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this article?</AlertDialogTitle><AlertDialogDescription>“{article?.title}” and its public article page will be permanently removed.</AlertDialogDescription></AlertDialogHeader>{deleteError && <Alert variant="destructive"><AlertDescription>{deleteError}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void handleDelete(); }}>{busy ? 'Deleting…' : 'Delete article'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </article>;
};

export const ArticlesListView = ({ account, onOpenArticle }: { account: Account | null; onOpenArticle: (slug: string) => void }) => {
  const page = useRestPage<ArticleSummary>('/api/articles');
  const [composing, setComposing] = useState(false);
  const articles = page.data?.nodes ?? [];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Feature articles</h2>{isAdmin(account) && <Button onClick={() => setComposing(true)}><Plus className="mr-2 size-4" />New article</Button>}</div>
    {page.loading && <div role="status"><span className="sr-only">Loading articles…</span><Skeleton className="h-48" /></div>}
    {page.error && <Alert variant="destructive"><AlertDescription>{page.error} <Button variant="outline" onClick={page.restart}>Restart articles</Button></AlertDescription></Alert>}
    {!page.loading && !page.error && articles.length === 0 && <Card><CardContent className="p-6 text-muted-foreground">No articles have been published yet.</CardContent></Card>}
    <div className="space-y-4">{articles.map(article => <Card key={article.id} className="overflow-hidden"><div className="grid sm:grid-cols-[14rem_minmax(0,1fr)]"><AspectRatio ratio={16 / 9} className="h-full bg-muted">{article.coverImageUrl ? <MediaImage src={mediaUrl(article.coverImageUrl)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><BookOpen className="size-10 text-muted-foreground" /></div>}</AspectRatio><div className="min-w-0"><CardHeader><CardTitle className="break-words text-xl"><a href={`#/articles/${article.slug}`} onClick={event => { event.preventDefault(); onOpenArticle(article.slug); }} className="inline-flex min-h-11 items-center hover:text-primary focus-visible:rounded-sm">{article.title}</a></CardTitle><CardDescription>{article.author || 'League staff'} · {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Publication date unavailable'}</CardDescription></CardHeader><CardContent><LazyText url={article.excerptUrl} label="Read excerpt" /><Button variant="link" className="px-0" onClick={() => onOpenArticle(article.slug)}>Read article</Button></CardContent></div></div></Card>)}</div>
    <PageButtons {...page} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} />
    {composing && <ArticleEditorModal onClose={() => setComposing(false)} onSaved={page.restart} />}
  </div>;
};
