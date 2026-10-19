import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COUNTRIES, flagUrl } from '../src/utils/league';

test('every referenced static file exists with its immutable hash and preserved font licenses', () => {
  const directory = new URL('../assets/storage/', import.meta.url);
  const assets = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as { key: string; source: string; path: string; sha256: string; contentType: string; size: number }[];
  for (const asset of assets) {
    assert.ok(!asset.source.includes('..') && !asset.source.startsWith('/'));
    const bytes = readFileSync(new URL(asset.source, directory));
    assert.equal(bytes.length, asset.size, asset.source);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.source);
    assert.ok(asset.path.startsWith(`static/${asset.sha256}.`));
    if (asset.contentType === 'font/woff2') assert.equal(bytes.subarray(0, 4).toString(), 'wOF2', asset.source);
  }
  assert.equal(assets.filter(asset => asset.key.startsWith('licenses/')).length, 6);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const fixture = readFileSync(new URL('browser/index.html', import.meta.url), 'utf8');
  const fontBlock = /<style id="storage-fonts">[\s\S]*?<\/style>/;
  assert.equal(fixture.match(fontBlock)?.[0], html.match(fontBlock)?.[0], 'browser fixture must use the same stored fonts');
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com|data:image/);
  const paths = html.matchAll(/asl-assets\/(static\/[a-f\d]+\.(?:woff2|png))/g).map(match => match[1]).toArray();
  assert.ok(paths.length > 16);
  for (const path of paths) assert.ok(assets.some(asset => asset.path === path), path);
  for (const country of COUNTRIES) {
    if (country === 'Other') continue;
    const url = flagUrl(country)!;
    assert.ok(url.startsWith('https://auth.example.test/storage/v1/object/public/asl-assets/static/'), country);
    assert.ok(assets.some(asset => url.endsWith(asset.path)), country);
  }
});
