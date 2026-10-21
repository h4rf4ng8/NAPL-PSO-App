import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import viteConfig from '../vite.config';
import { COUNTRIES, flagUrl } from '../src/utils/league';

test('hosted fonts and country flags preserve Storage URLs and browser font parity', async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const fixture = readFileSync(new URL('browser/index.html', import.meta.url), 'utf8');
  const fontBlock = /<style id="storage-fonts">[\s\S]*?<\/style>/;
  const fonts = html.match(fontBlock)?.[0];
  assert.ok(fonts, 'main HTML must declare stored fonts');
  const server = await createServer({
    ...viteConfig,
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    envFile: false,
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://auth.example.test') },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    css: { postcss: { plugins: [] } },
  });
  try {
    const main = await server.transformIndexHtml('/index.html', html);
    const browser = await server.transformIndexHtml('/test/browser/index.html', fixture);
    const transformedFonts = browser.match(fontBlock)?.[0];
    assert.equal(transformedFonts, main.match(fontBlock)?.[0], 'both pages must render identical fonts');
    assert.equal(transformedFonts, fonts.replaceAll('%VITE_SUPABASE_URL%', 'https://auth.example.test'));
    assert.equal(transformedFonts.match(/@font-face/g)?.length, 63);
    assert.doesNotMatch(browser, /<!-- storage-fonts -->|%VITE_SUPABASE_URL%/);
  } finally { await server.close(); }
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
