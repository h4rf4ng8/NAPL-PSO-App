import React from 'react';

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
  return parseMarkdownBlocks(body).map((block, index) => {
    if (block.kind === 'h2') return <h3 key={index} className={article ? 'mb-3 mt-7 text-2xl font-semibold' : 'mb-2 mt-5 text-xl font-semibold'}>{renderInline(block.text)}</h3>;
    if (block.kind === 'h3') return <h4 key={index} className="mb-2 mt-4 text-lg font-semibold">{renderInline(block.text)}</h4>;
    if (block.kind === 'p') return <p key={index} className="mb-4 leading-7">{renderInline(block.text)}</p>;
    if (block.kind !== 'ul' && block.kind !== 'ol') return null;
    const items = block.items.map((text, item) => <li key={item}>{renderInline(text)}</li>);
    return block.kind === 'ul'
      ? <ul key={index} className="mb-4 list-disc space-y-2 pl-6 leading-7">{items}</ul>
      : <ol key={index} className="mb-4 list-decimal space-y-2 pl-6 leading-7">{items}</ol>;
  });
};

export const renderRulesBody = (body: string) => renderMarkdownBody(body, false);
export const renderArticleBody = (body: string) => renderMarkdownBody(body, true);

type InlinePart={kind:'text';value:string}|{kind:'link';href:string;text:string};

type MarkdownBlock = {kind:'p'|'h2'|'h3';text:string}|{kind:'ul'|'ol';items:string[]};

const safeHttpUrl=(value:string):string|undefined=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}};


const renderInline = (text: string) => {
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
    const children = renderInlineMarkup(part.kind === 'link' ? part.text : part.value, `${part.kind === 'link' ? 'l' : 't'}${i}`);
    return part.kind === 'link'
      ? <a key={i} href={safeHttpUrl(part.href)} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{children}</a>
      : <span key={i}>{children}</span>;
  });
};

const renderInlineMarkup = (text: string, keyPrefix: string) => {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let cursor = 0, match, index = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    const token = match[0], key = `${keyPrefix}-${index++}`;
    if (token.startsWith('**')) out.push(<strong key={key} >{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) out.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{token.slice(1, -1)}</code>);
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    cursor = match.index + token.length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
};
