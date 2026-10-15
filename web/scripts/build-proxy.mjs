import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../.build/', import.meta.url));
await mkdir(dir, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('../api/proxy.ts', import.meta.url))],
  outfile: `${dir}/proxy.mjs`,
  platform: 'node', target: 'node24', format: 'esm', bundle: true,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log('Built server-only proxy bundle in web/.build; Vercel packages web/api/proxy.ts during deployment.');
