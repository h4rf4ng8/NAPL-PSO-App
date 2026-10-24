import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { autoExcerpt, readTime, renderArticleBody, renderRulesBody, slugify } from '../src/utils/content';

const html = (body: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, body));
const content = (value: React.ReactNode) => html(value).replaceAll(/ (?:class|style)="[^"]*"/g, '');

test('article helpers keep generated links and previews predictable', () => {
  assert.equal(slugify('  Season 2: Opening Weekend!  '), 'season-2-opening-weekend');
  assert.equal(autoExcerpt('## Recap\n\nA **great** match with [highlights](https://example.com).'), 'Recap A great match with highlights.');
  assert.equal(autoExcerpt('A long article preview', 8), 'A long a…');
  assert.equal(readTime('one two three'), 1);
});

test('rules and article markdown preserve block formatting and safe links', () => {
  const sample = '## **Heading**\nFirst `code` and *italics* with [safe](https://example.com) and [bad](javascript:alert(1)).\ncontinued.\n\n- **one**\n- [two](mailto:x@example.com)\n\n1. three';

  const expected = '<h3><span><strong>Heading</strong></span></h3><p><span>First <code>code</code> and <em>italics</em> with </span><a href="https://example.com/" target="_blank" rel="noopener noreferrer">safe</a><span> and </span><a target="_blank" rel="noopener noreferrer">bad</a><span>). continued.</span></p><ul><li><span><strong>one</strong></span></li><li><a target="_blank" rel="noopener noreferrer">two</a></li></ul><ol><li><span>three</span></li></ol>';
  assert.equal(content(renderRulesBody(sample)), expected);
  assert.equal(content(renderArticleBody(sample)), expected);
});
