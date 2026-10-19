import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COUNTRIES, flagUrl } from '../src/utils/league';

test('hosted assets preserve metadata, Storage URLs and local font license notices', () => {
  const directory = new URL('../assets/storage/', import.meta.url);
  const assets = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as { key: string; source?: string; path?: string; sha256?: string; size?: number; fontFaces?: Record<string, string>[] }[];
  for (const asset of assets) {
    if (asset.key.startsWith('licenses/')) {
      assert.match(asset.source!, /^licenses\/[a-z]+\.txt$/);
      const notice = readFileSync(new URL(asset.source!, directory));
      assert.equal(notice.length, asset.size, asset.key);
      assert.equal(createHash('sha256').update(notice).digest('hex'), asset.sha256, asset.key);
    } else {
      assert.match(asset.path!, /^static\/[a-f\d]{64}\.(?:woff2|png)$/);
      assert.equal(asset.source, undefined, 'Hosted binaries need no local source');
      if (asset.key.startsWith('fonts/')) assert.ok(asset.fontFaces!.length > 0, asset.key);
    }
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
    assert.match(url, /^https:\/\/auth\.example\.test\/storage\/v1\/object\/public\/asl-assets\/static\/[a-f\d]{64}\.png$/, country);
  }
});
