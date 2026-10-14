import { build } from 'esbuild';
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { builtinModules } from 'node:module';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(api, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const staging = await mkdtemp(path.join(dist, '.lambda-'));
try {
  const result = await build({
    entryPoints: [path.join(api, 'lambda.ts')], bundle: true, platform: 'node', target: 'node24',
    format: 'esm', outfile: path.join(staging, 'lambda.js'), sourcemap: false, metafile: true,
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
  await writeFile(path.join(staging, 'package.json'), '{"type":"module"}\n');
  await rm(path.join(dist, 'api.zip'), { force: true });
  await exec('zip', ['-qr', path.join(dist, 'api.zip'), '.'], { cwd: staging });

  const archiveListing = await exec('unzip', ['-Z1', path.join(dist, 'api.zip')]);
  const listing = archiveListing.stdout.split('\n').filter(Boolean);
  if (!listing.includes('lambda.js') || !listing.includes('package.json')) {
    throw new Error('Lambda archive is missing its handler or package metadata');
  }
  if (listing.some(name => !['lambda.js', 'package.json'].includes(name))) {
    throw new Error('Lambda archive contains files outside the self-contained handler and package metadata');
  }
  await cp(path.join(staging, 'lambda.js'), path.join(dist, 'lambda.js'));
  const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
  // These optional imports are used only by native PG or telemetry paths.
  const optional = new Set(['pg-native', '@opentelemetry/api']);
  const external = Object.values(result.metafile.outputs).flatMap(output => output.imports)
    .filter(item => item.external && !nodeBuiltins.has(item.path) && !optional.has(item.path)).map(item => item.path);
  if (external.length > 0) throw new Error(`Lambda bundle is not self-contained: ${external.join(', ')}`);
  const archiveStats = await stat(path.join(dist, 'api.zip'));
  console.log(`Built ${path.join(dist, 'api.zip')} (${archiveStats.size} bytes)`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
