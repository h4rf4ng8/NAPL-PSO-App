import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COUNTRIES, flagUrl } from '../src/utils/league';

test('hosted fonts and country flags preserve Storage URLs and browser font parity', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const fixture = readFileSync(new URL('browser/index.html', import.meta.url), 'utf8');
  const fontBlock = /<style id="storage-fonts">[\s\S]*?<\/style>/;
  const fonts = html.match(fontBlock)?.[0];
  assert.ok(fonts, 'main HTML must declare stored fonts');
  assert.equal(fixture.match(fontBlock)?.[0], fonts, 'browser fixture must use the same stored fonts');
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com|data:image/);
  const urls = fonts.matchAll(/url\("([^"]+)"\)/g).map(match => match[1]).toArray();
  assert.ok(urls.length > 16);
  for (const url of urls) assert.match(url, /^%VITE_SUPABASE_URL%\/storage\/v1\/object\/public\/asl-assets\/static\/[a-f\d]{64}\.woff2$/);
  assert.match(html, /<link rel="icon" type="image\/png" href="%VITE_SUPABASE_URL%\/storage\/v1\/object\/public\/asl-assets\/static\/[a-f\d]{64}\.png" \/>/);
  for (const country of COUNTRIES) {
    if (country === 'Other') continue;
    const url = flagUrl(country)!;
    assert.match(url, /^https:\/\/auth\.example\.test\/storage\/v1\/object\/public\/asl-assets\/static\/[a-f\d]{64}\.png$/, country);
  }
});
