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

// ============ RULES: markdown-lite renderer ============
// Renders a subset of markdown safely inline (no HTML injection). Supports:
// ## Heading, ### Sub-heading, **bold**, *italic*, - bullets, 1. numbered,
// blank lines split paragraphs, [text](url) links, `code`.
export const renderRulesBody = (body: string) => {
  if (!body) return null;
  const lines = body.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let listType: 'ul'|'ol'|null = null; // 'ul' | 'ol' | null
  let listItems:string[] = [];
  let paraBuf:string[] = [];

  const flushPara = () => {
    if (paraBuf.length === 0) {
      return;
    }

    blocks.push({ kind: 'p', text: paraBuf.join(' ') });
    paraBuf = [];
  };
  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    if(listType) blocks.push({ kind: listType, items: listItems });
    listItems = [];
    listType = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^##\s+/.test(line))        { flushPara(); flushList(); blocks.push({ kind: 'h2', text: line.replace(/^##\s+/, '') }); continue; }
    if (/^###\s+/.test(line))       { flushPara(); flushList(); blocks.push({ kind: 'h3', text: line.replace(/^###\s+/, '') }); continue; }
    if (/^-\s+/.test(line))         { flushPara(); if (listType !== 'ul') { flushList(); listType = 'ul'; } listItems.push(line.replace(/^-\s+/, '')); continue; }
    if (/^\d+\.\s+/.test(line))     { flushPara(); if (listType !== 'ol') { flushList(); listType = 'ol'; } listItems.push(line.replace(/^\d+\.\s+/, '')); continue; }
    // Regular paragraph line
    flushList();
    paraBuf.push(line);
  }
  flushPara();
  flushList();

  // Convert inline markup: **bold**, *italic*, `code`, [text](url)
  

  return blocks.map((b, i) => {
    if (b.kind === 'h2') return <h3 key={i} className="font-heading tracking-wider text-lg mt-4 mb-2" style={{ color: C.brandNavyDeep, letterSpacing: '0.15em' }}>{renderRulesInline(b.text)}</h3>;
    if (b.kind === 'h3') return <h4 key={i} className="font-heading tracking-wider text-sm mt-3 mb-1" style={{ color: C.brandNavy, letterSpacing: '0.15em' }}>{renderRulesInline(b.text)}</h4>;
    if (b.kind === 'p')  return <p key={i} className="font-body text-sm mb-2 leading-relaxed" style={{ color: C.brandNavy }}>{renderRulesInline(b.text)}</p>;
    if (b.kind === 'ul') return <ul key={i} className="list-disc pl-5 mb-2 space-y-1 font-body text-sm leading-relaxed" style={{ color: C.brandNavy }}>{b.items.map((t, j) => <li key={j}>{renderRulesInline(t)}</li>)}</ul>;
    return b.kind === 'ol' ? <ol key={i} className="list-decimal pl-5 mb-2 space-y-1 font-body text-sm leading-relaxed" style={{ color: C.brandNavy }}>{b.items.map((t, j) => <li key={j}>{renderRulesInline(t)}</li>)}</ol> : null;
  });
};

// Article-sized renderer — same markdown rules as renderRulesBody but
// bumped typography for a long-form reading experience. Rules stay compact
// (scannable); articles get magazine-sized paragraphs.
export const renderArticleBody = (body: string) => {
  if (!body) return null;
  const lines = body.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let listType:'ul'|'ol'|null=null;let listItems:string[]=[];let paraBuf:string[]=[];
  const flushPara = () => { if (paraBuf.length === 0) {
    return;
  }

  blocks.push({ kind: 'p', text: paraBuf.join(' ') }); paraBuf = []; };
  const flushList = () => { if (listItems.length === 0) {
    return;
  }

  if(listType) blocks.push({ kind: listType, items: listItems }); listItems = []; listType = null; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^##\s+/.test(line))     { flushPara(); flushList(); blocks.push({ kind: 'h2', text: line.replace(/^##\s+/, '') }); continue; }
    if (/^###\s+/.test(line))    { flushPara(); flushList(); blocks.push({ kind: 'h3', text: line.replace(/^###\s+/, '') }); continue; }
    if (/^-\s+/.test(line))      { flushPara(); if (listType !== 'ul') { flushList(); listType = 'ul'; } listItems.push(line.replace(/^-\s+/, '')); continue; }
    if (/^\d+\.\s+/.test(line))  { flushPara(); if (listType !== 'ol') { flushList(); listType = 'ol'; } listItems.push(line.replace(/^\d+\.\s+/, '')); continue; }
    flushList();
    paraBuf.push(line);
  }
  flushPara(); flushList();
  // Inline markdown — same as renderRulesBody
  
  return blocks.map((b, i) => {
    if (b.kind === 'h2') return <h3 key={i} className="font-display tracking-wider mt-7 mb-3" style={{ color: C.brandNavyDeep, letterSpacing: '0.08em', fontSize: 28, lineHeight: 1.2 }}>{renderArticleInline(b.text)}</h3>;
    if (b.kind === 'h3') return <h4 key={i} className="font-heading tracking-wider mt-5 mb-2" style={{ color: C.brandNavy, letterSpacing: '0.12em', fontSize: 20 }}>{renderArticleInline(b.text)}</h4>;
    if (b.kind === 'p')  return <p key={i} className="font-body mb-4" style={{ color: C.brandNavy, fontSize: 18, lineHeight: 1.75 }}>{renderArticleInline(b.text)}</p>;
    if (b.kind === 'ul') return <ul key={i} className="list-disc pl-6 mb-4 space-y-2 font-body" style={{ color: C.brandNavy, fontSize: 18, lineHeight: 1.7 }}>{b.items.map((t, j) => <li key={j}>{renderArticleInline(t)}</li>)}</ul>;
    return b.kind === 'ol' ? <ol key={i} className="list-decimal pl-6 mb-4 space-y-2 font-body" style={{ color: C.brandNavy, fontSize: 18, lineHeight: 1.7 }}>{b.items.map((t, j) => <li key={j}>{renderArticleInline(t)}</li>)}</ol> : null;
  });
};

export type InlinePart={kind:'text';value:string}|{kind:'link';href:string;text:string};

export type MarkdownBlock = {kind:'p'|'h2'|'h3';text:string}|{kind:'ul'|'ol';items:string[]};

export const safeHttpUrl=(value:string):string|undefined=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}};


const renderRulesInline = (text: string) => {
    const parts: InlinePart[] = [];
    // Split on link pattern first, then inline markup
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0, m;
    while ((m = linkRe.exec(text)) !== null) {
      if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
      parts.push({ kind: 'link', text: m[1], href: m[2] });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });

    // Now process bold/italic/code inside text parts
    
    return parts.map((p, i) => {
      return p.kind === 'link' ? <a key={i} href={safeHttpUrl(p.href)} target="_blank" rel="noopener noreferrer" style={{ color: C.brandNavy, textDecoration: 'underline' }}>{applyRulesMarkup(p.text, `l${i}`)}</a> : <span key={i}>{applyRulesMarkup(p.value, `t${i}`)}</span>;
    });
  };
const renderArticleInline = (text: string) => {
    const parts:InlinePart[] = [];
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0, m;
    while ((m = linkRe.exec(text)) !== null) {
      if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
      parts.push({ kind: 'link', text: m[1], href: m[2] });
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
    
    return parts.map((p, i) => {
      return p.kind === 'link' ? <a key={i} href={safeHttpUrl(p.href)} target="_blank" rel="noopener noreferrer" style={{ color: C.brandNavy, textDecoration: 'underline' }}>{applyArticleMarkup(p.text, `l${i}`)}</a> : <span key={i}>{applyArticleMarkup(p.value, `t${i}`)}</span>;
    });
  };
const applyRulesMarkup = (str: string, keyPrefix: string) => {
      const out:React.ReactNode[] = [];
      const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
      let cursor = 0, mm;
      let idx = 0;
      while ((mm = re.exec(str)) !== null) {
        if (mm.index > cursor) out.push(str.slice(cursor, mm.index));
        const tok = mm[0];
        const k = `${keyPrefix}-${idx++}`;
        if (tok.startsWith('**'))       out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
        else if (tok.startsWith('`'))   out.push(<code key={k} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9em', background: 'rgba(216,184,88,0.15)', padding: '1px 5px', borderRadius: 3 }}>{tok.slice(1, -1)}</code>);
        else                            out.push(<em key={k}>{tok.slice(1, -1)}</em>);
        cursor = mm.index + tok.length;
      }
      if (cursor < str.length) out.push(str.slice(cursor));
      return out;
    };
const applyArticleMarkup = (s: string, keyPrefix: string) => {
      const out:React.ReactNode[] = [];
      const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
      let i2 = 0, mm, k = 0;
      while ((mm = re.exec(s)) !== null) {
        if (mm.index > i2) out.push(s.slice(i2, mm.index));
        const tok = mm[0];
        if (tok.startsWith('**')) out.push(<strong key={`${keyPrefix}-${k++}`} style={{ color: C.brandNavyDeep }}>{tok.slice(2, -2)}</strong>);
        else if (tok.startsWith('*')) out.push(<em key={`${keyPrefix}-${k++}`}>{tok.slice(1, -1)}</em>);
        else out.push(<code key={`${keyPrefix}-${k++}`} className="font-mono text-sm px-1 py-0.5 rounded" style={{ background: `${C.navyLight}22` }}>{tok.slice(1, -1)}</code>);
        i2 = mm.index + tok.length;
      }
      if (i2 < s.length) out.push(s.slice(i2));
      return out;
    };