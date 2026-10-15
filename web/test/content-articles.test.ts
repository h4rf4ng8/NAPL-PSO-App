import test from 'node:test';
import assert from 'node:assert/strict';
import { autoExcerpt, readTime, slugify } from '../src/utils/content';

test('article helpers keep generated links and previews predictable', () => {
  assert.equal(slugify('  Season 2: Opening Weekend!  '), 'season-2-opening-weekend');
  assert.equal(autoExcerpt('## Recap\n\nA **great** match with [highlights](https://example.com).'), 'Recap A great match with highlights.');
  assert.equal(autoExcerpt('A long article preview', 8), 'A long a…');
  assert.equal(readTime('one two three'), 1);
});
