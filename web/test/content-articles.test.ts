import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { autoExcerpt, readTime, renderArticleBody, renderRulesBody, slugify } from '../src/utils/content';

const html = (body: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, body));

test('article helpers keep generated links and previews predictable', () => {
  assert.equal(slugify('  Season 2: Opening Weekend!  '), 'season-2-opening-weekend');
  assert.equal(autoExcerpt('## Recap\n\nA **great** match with [highlights](https://example.com).'), 'Recap A great match with highlights.');
  assert.equal(autoExcerpt('A long article preview', 8), 'A long a…');
  assert.equal(readTime('one two three'), 1);
});

test('rules and article markdown keep their distinct rendered output and safe links', () => {
  const sample = '## **Heading**\nFirst `code` and *italics* with [safe](https://example.com) and [bad](javascript:alert(1)).\ncontinued.\n\n- **one**\n- [two](mailto:x@example.com)\n\n1. three';

  assert.equal(html(renderRulesBody(sample)), '<h3 class="font-heading tracking-wider text-lg mt-4 mb-2" style="color:#185090;letter-spacing:0.15em"><span><strong>Heading</strong></span></h3><p class="font-body text-sm mb-2 leading-relaxed" style="color:#3068b0"><span>First <code style="font-family:JetBrains Mono, monospace;font-size:0.9em;background:rgba(216,184,88,0.15);padding:1px 5px;border-radius:3px">code</code> and <em>italics</em> with </span><a href="https://example.com/" target="_blank" rel="noopener noreferrer" style="color:#3068b0;text-decoration:underline">safe</a><span> and </span><a target="_blank" rel="noopener noreferrer" style="color:#3068b0;text-decoration:underline">bad</a><span>). continued.</span></p><ul class="list-disc pl-5 mb-2 space-y-1 font-body text-sm leading-relaxed" style="color:#3068b0"><li><span><strong>one</strong></span></li><li><a target="_blank" rel="noopener noreferrer" style="color:#3068b0;text-decoration:underline">two</a></li></ul><ol class="list-decimal pl-5 mb-2 space-y-1 font-body text-sm leading-relaxed" style="color:#3068b0"><li><span>three</span></li></ol>');
  assert.equal(html(renderArticleBody(sample)), '<h3 class="font-display tracking-wider mt-7 mb-3" style="color:#185090;letter-spacing:0.08em;font-size:28px;line-height:1.2"><span><strong style="color:#185090">Heading</strong></span></h3><p class="font-body mb-4" style="color:#3068b0;font-size:18px;line-height:1.75"><span>First <code class="font-mono text-sm px-1 py-0.5 rounded" style="background:#dfe4f022">code</code> and <em>italics</em> with </span><a href="https://example.com/" target="_blank" rel="noopener noreferrer" style="color:#3068b0;text-decoration:underline">safe</a><span> and </span><a target="_blank" rel="noopener noreferrer" style="color:#3068b0;text-decoration:underline">bad</a><span>). continued.</span></p><ul class="list-disc pl-6 mb-4 space-y-2 font-body" style="color:#3068b0;font-size:18px;line-height:1.7"><li><span><strong style="color:#185090">one</strong></span></li><li><a target="_blank" rel="noopener noreferrer" style="color:#3068b0;text-decoration:underline">two</a></li></ul><ol class="list-decimal pl-6 mb-4 space-y-2 font-body" style="color:#3068b0;font-size:18px;line-height:1.7"><li><span>three</span></li></ol>');
});
