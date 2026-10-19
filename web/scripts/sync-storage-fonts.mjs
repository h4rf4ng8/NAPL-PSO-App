import { ASSET_BUCKET } from '@napl/contracts/storage';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const assets = JSON.parse(await readFile(new URL('assets/storage/manifest.json', root), 'utf8'));
const favicon = assets.find(asset => asset.key === 'logos/asl_logo_src');
if (!favicon) throw new Error('Missing favicon asset');
const icon = `<link rel="icon" type="image/png" href="%VITE_SUPABASE_URL%/storage/v1/object/public/${ASSET_BUCKET}/${favicon.path}" />`;
const style = '<style id="storage-fonts">\n' + assets.flatMap(asset => (asset.fontFaces ?? []).map(face => {
  const properties = Object.entries(face).map(([key, value]) => `  ${key}: ${value};`).join('\n');
  return `@font-face {\n${properties}\n  src: url("%VITE_SUPABASE_URL%/storage/v1/object/public/${ASSET_BUCKET}/${asset.path}") format('woff2');\n}`;
})).join('\n') + '\n</style>';
for (const name of ['index.html', 'test/browser/index.html']) {
  const path = new URL(name, root);
  const before = await readFile(path, 'utf8');
  if (name === 'index.html' && !before.includes('<link rel="icon"')) throw new Error('Missing favicon declaration');
  const after = before.replace(/<link rel="icon"[^>]*>/, () => icon).replace(/<style id="storage-fonts">[\s\S]*?<\/style>/, () => style);
  if (after === before && !before.includes('id="storage-fonts"')) throw new Error(`Missing font block: ${name}`);
  if (process.argv.includes('--check')) {
    if (after !== before) throw new Error(`Storage font declarations need regeneration: ${name}`);
  } else if (after !== before) await writeFile(path, after);
}
