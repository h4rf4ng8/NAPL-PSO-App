import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const assets = JSON.parse(await readFile(new URL('assets/storage/manifest.json', root), 'utf8'));
const style = '<style id="storage-fonts">\n' + assets.flatMap(asset => (asset.fontFaces ?? []).map(face => {
  const properties = Object.entries(face).map(([key, value]) => `  ${key}: ${value};`).join('\n');
  return `@font-face {\n${properties}\n  src: url("%VITE_SUPABASE_URL%/storage/v1/object/public/asl-assets/${asset.path}") format('woff2');\n}`;
})).join('\n') + '\n</style>';
for (const name of ['index.html', 'test/browser/index.html']) {
  const path = new URL(name, root);
  const before = await readFile(path, 'utf8');
  const after = before.replace(/<style id="storage-fonts">[\s\S]*?<\/style>/, () => style);
  if (after === before && !before.includes('id="storage-fonts"')) throw new Error(`Missing font block: ${name}`);
  if (process.argv.includes('--check')) {
    if (after !== before) throw new Error(`Storage font declarations need regeneration: ${name}`);
  } else if (after !== before) await writeFile(path, after);
}
