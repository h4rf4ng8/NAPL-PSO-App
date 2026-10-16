import React from 'react';
import { C } from '../theme/theme';

// ============ ARTICLES ============
// Long-form content lives here (match recaps, interviews, feature pieces).
// Admin-only authoring. Each article has a URL-friendly slug for sharing
// (/articles/the-article-slug). Separate from the news feed which is for
// quick updates and announcements.

// Slug generator — reduces a title to URL-safe lowercase-with-dashes.
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .slice(0, 80);

// Auto-generate a short preview from the body if no excerpt is set
export const autoExcerpt = (body: string, limit: number = 160) => {
  const plain = body
    .replaceAll(/[#*`_]+/g, '')
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replaceAll(/\s+/g, ' ')
    .trim();
  return plain.length > limit ? plain.slice(0, limit).trimEnd() + '…' : plain;
};

export const readTime = (body: string) => {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

const parseMarkdownBlocks = (body: string): MarkdownBlock[] => {
  const lines = body.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let paraBuf: string[] = [];
  const flushPara = () => {
    if (paraBuf.length === 0) return;
    blocks.push({ kind: 'p', text: paraBuf.join(' ') });
    paraBuf = [];
  };
  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    blocks.push({ kind: listType, items: listItems });
    listItems = [];
    listType = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^##\s+/.test(line)) { flushPara(); flushList(); blocks.push({ kind: 'h2', text: line.replace(/^##\s+/, '') }); continue; }
    if (/^###\s+/.test(line)) { flushPara(); flushList(); blocks.push({ kind: 'h3', text: line.replace(/^###\s+/, '') }); continue; }
    if (/^-\s+/.test(line)) { flushPara(); if (listType !== 'ul') { flushList(); listType = 'ul'; } listItems.push(line.replace(/^-\s+/, '')); continue; }
    if (/^\d+\.\s+/.test(line)) { flushPara(); if (listType !== 'ol') { flushList(); listType = 'ol'; } listItems.push(line.replace(/^\d+\.\s+/, '')); continue; }
    flushList();
    paraBuf.push(line);
  }
  flushPara(); flushList();
  return blocks;
};

const renderMarkdownBody = (body: string, article: boolean) => {
  if (!body) return null;
  return parseMarkdownBlocks(body).map((block, i) => {
    const inline = (text: string) => renderInline(text, article);
    if (block.kind === 'h2') return article
      ? <h3 key={i} className="font-display tracking-wider mt-7 mb-3" style={{ color: C.brandNavyDeep, letterSpacing: '0.08em', fontSize: 28, lineHeight: 1.2 }}>{inline(block.text)}</h3>
      : <h3 key={i} className="font-heading tracking-wider text-lg mt-4 mb-2" style={{ color: C.brandNavyDeep, letterSpacing: '0.15em' }}>{inline(block.text)}</h3>;
    if (block.kind === 'h3') return article
      ? <h4 key={i} className="font-heading tracking-wider mt-5 mb-2" style={{ color: C.brandNavy, letterSpacing: '0.12em', fontSize: 20 }}>{inline(block.text)}</h4>
      : <h4 key={i} className="font-heading tracking-wider text-sm mt-3 mb-1" style={{ color: C.brandNavy, letterSpacing: '0.15em' }}>{inline(block.text)}</h4>;
    if (block.kind === 'p') return article
      ? <p key={i} className="font-body mb-4" style={{ color: C.brandNavy, fontSize: 18, lineHeight: 1.75 }}>{inline(block.text)}</p>
      : <p key={i} className="font-body text-sm mb-2 leading-relaxed" style={{ color: C.brandNavy }}>{inline(block.text)}</p>;
    if (block.kind !== 'ul' && block.kind !== 'ol') return null;
    const items = block.items.map((text, j) => <li key={j}>{inline(text)}</li>);
    return block.kind === 'ul'
      ? (article
        ? <ul key={i} className="list-disc pl-6 mb-4 space-y-2 font-body" style={{ color: C.brandNavy, fontSize: 18, lineHeight: 1.7 }}>{items}</ul>
        : <ul key={i} className="list-disc pl-5 mb-2 space-y-1 font-body text-sm leading-relaxed" style={{ color: C.brandNavy }}>{items}</ul>)
      : (article
        ? <ol key={i} className="list-decimal pl-6 mb-4 space-y-2 font-body" style={{ color: C.brandNavy, fontSize: 18, lineHeight: 1.7 }}>{items}</ol>
        : <ol key={i} className="list-decimal pl-5 mb-2 space-y-1 font-body text-sm leading-relaxed" style={{ color: C.brandNavy }}>{items}</ol>);
  });
};

export const renderRulesBody = (body: string) => renderMarkdownBody(body, false);
export const renderArticleBody = (body: string) => renderMarkdownBody(body, true);

type InlinePart={kind:'text';value:string}|{kind:'link';href:string;text:string};

export type MarkdownBlock = {kind:'p'|'h2'|'h3';text:string}|{kind:'ul'|'ol';items:string[]};

export const safeHttpUrl=(value:string):string|undefined=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}};


const renderInline = (text: string, article: boolean) => {
  const parts: InlinePart[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, match;
  while ((match = linkRe.exec(text)) !== null) {
    if (match.index > last) parts.push({ kind: 'text', value: text.slice(last, match.index) });
    parts.push({ kind: 'link', text: match[1], href: match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts.map((part, i) => {
    const children = renderInlineMarkup(part.kind === 'link' ? part.text : part.value, article, `${part.kind === 'link' ? 'l' : 't'}${i}`);
    return part.kind === 'link'
      ? <a key={i} href={safeHttpUrl(part.href)} target="_blank" rel="noopener noreferrer" style={{ color: C.brandNavy, textDecoration: 'underline' }}>{children}</a>
      : <span key={i}>{children}</span>;
  });
};

const renderInlineMarkup = (text: string, article: boolean, keyPrefix: string) => {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let cursor = 0, match, index = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    const token = match[0], key = `${keyPrefix}-${index++}`;
    if (token.startsWith('**')) out.push(<strong key={key} style={article ? { color: C.brandNavyDeep } : undefined}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) out.push(article
      ? <code key={key} className="font-mono text-sm px-1 py-0.5 rounded" style={{ background: `${C.navyLight}22` }}>{token.slice(1, -1)}</code>
      : <code key={key} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9em', background: 'rgba(216,184,88,0.15)', padding: '1px 5px', borderRadius: 3 }}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    cursor = match.index + token.length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
};
