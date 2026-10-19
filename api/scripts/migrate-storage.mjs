import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { chmod, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import ipaddr from 'ipaddr.js';

const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const mediaLimit = 1_500_000;
const publicLimit = 5_000_000;
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const bucketSpecs = [
  { id: 'asl-assets', name: 'asl-assets', public: true, file_size_limit: publicLimit, allowed_mime_types: [...imageTypes, 'image/gif', 'image/svg+xml', 'image/x-icon', 'font/woff2', 'text/plain', 'application/pdf'] },
  { id: 'asl-private-media', name: 'asl-private-media', public: false, file_size_limit: mediaLimit, allowed_mime_types: imageTypes },
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
const encodedPath = value => value.split('/').map(part => encodeURIComponent(part)).join('/');

export function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ['image/png', 'png'];
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ['image/jpeg', 'jpg'];
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return ['image/webp', 'webp'];
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) && bytes.length >= 14 && bytes.readUInt16LE(6) > 0 && bytes.readUInt16LE(8) > 0 && bytes.at(-1) === 59) return ['image/gif', 'gif'];
  fail('unsupported_image');
}

// Pin the checked DNS address so redirects and DNS rebinding cannot reach private hosts.
export async function discordImage(value, redirects = 0) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.discordapp.com' || url.username || url.password || url.port || redirects > 3) fail('remote_host_rejected');
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => ipaddr.process(address).range() !== 'unicast')) fail('remote_address_rejected');
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      lookup: (_host, options, done) => options.all ? done(null, [addresses[0]]) : done(null, addresses[0].address, addresses[0].family),
      signal: AbortSignal.timeout(15_000),
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location) return reject(new Error('remote_redirect_missing'));
        resolve(discordImage(new URL(response.headers.location, url).href, redirects + 1));
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`remote_http_${response.statusCode}`)); return; }
      if (Number(response.headers['content-length'] ?? 0) > mediaLimit) { response.destroy(); reject(new Error('remote_too_large')); return; }
      let size = 0;
      const chunks = [];
      response.on('data', chunk => {
        size += chunk.length;
        if (size > mediaLimit) { response.destroy(new Error('remote_too_large')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', () => reject(new Error('remote_network_failed')));
  });
}

async function saveState(directory, state) {
  const temporary = path.join(directory, 'manifest.tmp');
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path.join(directory, 'manifest.json'));
}

export function assertOutsideRepository(directory) {
  const roots = [repo];
  if (path.basename(process.cwd()) === 'api') roots.push(path.resolve(process.cwd(), '..'));
  if (roots.some(root => directory === root || directory.startsWith(`${root}${path.sep}`))) fail('state_must_be_outside_repository');
}

async function privateDirectory(directory) {
  assertOutsideRepository(path.resolve(directory));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const actual = await realpath(directory);
  assertOutsideRepository(actual);
  await chmod(actual, 0o700);
  return actual;
}

async function database(work) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.searchParams.get('sslmode') !== 'verify-full' || !url.searchParams.get('sslrootcert')) fail('verified_database_tls_required');
  // One Client, never a pool; relative CA path resolves from the original api/ cwd.
  const client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 10_000 });
  try { await client.connect(); return await work(client); } finally { await client.end(); }
}

async function stage(directory, entry, bytes) {
  if (bytes.length === 0 || bytes.length > (entry.table ? mediaLimit : publicLimit)) fail('asset_size_rejected');
  entry.sha256 = hash(bytes);
  entry.size = bytes.length;
  entry.blob = `${entry.sha256}.bin`;
  await writeFile(path.join(directory, entry.blob), bytes, { mode: 0o600 });
  await chmod(path.join(directory, entry.blob), 0o600);
  return entry;
}

async function prepareMedia(directory, row, origin) {
  const embedded = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec((row.recoverySource ?? row.original));
  const bytes = embedded ? Buffer.from(embedded[2], 'base64') : await discordImage((row.recoverySource ?? row.original));
  const [contentType, extension] = imageType(bytes);
  if (contentType === 'image/gif' && row.private) fail('unsupported_image');
  if (embedded && (contentType !== embedded[1] || bytes.toString('base64') !== embedded[2])) fail('invalid_embedded_image');
  const entry = await stage(directory, { ...row, contentType, bucket: row.private ? 'asl-private-media' : 'asl-assets' }, bytes);
  const kind = { accounts: 'account-image', teams: 'team-logo', articles: 'article-cover' }[row.table];
  entry.path = `${kind}/${row.actor}/${Buffer.from(row.id).toString('base64url')}/${entry.sha256}.${extension}`;
  entry.destination = `${origin}/storage/v1/object/${row.private ? 'authenticated' : 'public'}/${entry.bucket}/${encodedPath(entry.path)}`;
  return entry;
}

async function prepare(directory, staticManifest, origin) {
  try { await stat(path.join(directory, 'manifest.json')); fail('state_already_exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const state = { version: 1, origin, createdAt: new Date().toISOString(), entries: [], failures: [] };
  const rows = await database(async client => {
    await client.query('begin read only');
    const { rows } = await client.query(`select 'accounts' as "table", id::text, image_url as original, 'image_url' as "column", false as private, id::text as actor from asl.accounts where image_url is not null
      union all select 'accounts',id::text,pending_image_url,'pending_image_url',true,id::text from asl.accounts where pending_image_url is not null
      union all select 'teams',id,logo_url,'logo_url',status <> 'approved',owner_account_id::text from asl.teams where logo_url is not null
      union all select 'articles',id,cover_image_url,'cover_image_url',published_at is null,'migration' from asl.articles where cover_image_url is not null`);
    await client.query('rollback');
    return rows;
  });
    for (const row of rows) {
      if (!row.original || row.original.startsWith(`${origin}/storage/v1/object/`) || row.original.startsWith('storage://')) continue;
      try {
        state.entries.push(await prepareMedia(directory, row, origin));
      } catch (error) {
        state.failures.push({ ...row, code: safeCode(error) });
      }
    }
  if (staticManifest) {
    const manifestPath = await realpath(staticManifest);
    const base = path.dirname(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const entries = Array.isArray(manifest) ? manifest : manifest.entries;
    for (const entry of entries) {
      const source = await realpath(path.resolve(base, entry.source));
      if (!source.startsWith(`${base}${path.sep}`)) fail('static_source_outside_manifest');
      const bytes = await readFile(source);
      if (hash(bytes) !== entry.sha256 || bytes.length !== entry.size || !/^static\/[a-f0-9]{64}\.[a-z0-9]+$/.test(entry.path) || !entry.path.includes(entry.sha256) || !bucketSpecs[0].allowed_mime_types.includes(entry.contentType)) fail('static_manifest_invalid');
      state.entries.push(await stage(directory, { bucket: 'asl-assets', path: entry.path, contentType: entry.contentType }, bytes));
    }
  }
  await saveState(directory, state);
  report(state);
}

async function retry(directory, origin) {
  const state = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (state.version !== 1 || state.origin !== origin) fail('state_project_mismatch');
  const remaining = [];
  for (const failure of state.failures) {
    try {
      if (typeof failure.private !== 'boolean' || !failure.actor) fail('retry_metadata_missing');
      const row = failure;
      state.entries.push(await prepareMedia(directory, row, origin));
    } catch (error) { remaining.push({ ...failure, code: safeCode(error) }); }
  }
  state.failures = remaining;
  await saveState(directory, state);
  report(state);
}

function safeCode(error) {
  return /^(remote_[a-z0-9_]+|unsupported_image|invalid_embedded_image|asset_size_rejected)$/.test(error.message) ? error.message : 'prepare_failed';
}

function report(state) {
  const failures = {};
  for (const failure of state.failures) failures[failure.code] = (failures[failure.code] ?? 0) + 1;
  console.log(JSON.stringify({ prepared: state.entries.length, bytes: state.entries.reduce((n, entry) => n + entry.size, 0), applied: state.entries.filter(entry => entry.applied).length, failures }));
}

async function storageRequest(origin, route, options = {}) {
  return fetch(`${origin}/storage/v1/${route}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(30_000), headers: {
    apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, ...options.headers,
  } });
}

async function verifiedObject(origin, entry) {
  const response = await storageRequest(origin, `object/authenticated/${entry.bucket}/${encodedPath(entry.path)}`);
  if (response.status === 404 || response.status === 400) return false;
  if (!response.ok) fail('object_verification_failed');
  let length = 0;
  const digest = createHash('sha256');
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > entry.size) fail('object_size_mismatch');
    digest.update(chunk);
  }
  if (length !== entry.size || digest.digest('hex') !== entry.sha256) fail('object_hash_mismatch');
  return true;
}

function mediaPredicate(entry) {
  if (!({ accounts: ['image_url', 'pending_image_url'], teams: ['logo_url'], articles: ['cover_image_url'] })[entry.table]?.includes(entry.column)) fail('state_column_invalid');
  if (entry.table === 'teams') return `(status <> 'approved')=$4 and owner_account_id::text=$5`;
  if (entry.table === 'articles') return '(published_at is null)=$4 and $5::text is not null';
  return `${entry.column === 'pending_image_url' ? 'true' : 'false'}=$4 and id::text=$5`;
}

async function matchingMedia(client, entry, predicate) {
  const result = await client.query(`select count(*)::int count from asl.${entry.table} where id::text=$2 and ${entry.column} in ($1,$3) and ${predicate}`, [entry.destination, entry.id, entry.original, entry.private, entry.actor]);
  if (result.rows[0].count !== 1) fail('database_compare_and_swap_conflict');
}

async function apply(directory, origin) {
  if (!process.env.SUPABASE_SECRET_KEY) fail('storage_secret_required');
  const state = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (state.version !== 1 || state.origin !== origin) fail('state_project_mismatch');
  for (const spec of bucketSpecs) {
    let response = await storageRequest(origin, `bucket/${spec.id}`);
    if ([400, 404].includes(response.status)) {
      response = await storageRequest(origin, 'bucket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spec) });
      if (!response.ok) fail('bucket_creation_failed');
      response = await storageRequest(origin, `bucket/${spec.id}`);
    }
    if (!response.ok) fail('bucket_read_failed');
    const bucket = await response.json();
    if (bucket.public !== spec.public || Number(bucket.file_size_limit) !== spec.file_size_limit || JSON.stringify((bucket.allowed_mime_types ?? []).toSorted((a, b) => a.localeCompare(b))) !== JSON.stringify(spec.allowed_mime_types.toSorted((a, b) => a.localeCompare(b)))) fail('existing_bucket_configuration_mismatch');
  }
  await database(async client => {
    for (const entry of state.entries) {
      if (entry.applied) continue;
      const predicate = entry.table ? mediaPredicate(entry) : null;
      if (entry.table) await matchingMedia(client, entry, predicate);
      const bytes = await readFile(path.join(directory, `${entry.sha256}.bin`));
      if (hash(bytes) !== entry.sha256 || bytes.length !== entry.size) fail('staged_hash_mismatch');
      if (!await verifiedObject(origin, entry)) {
        const response = await storageRequest(origin, `object/${entry.bucket}/${encodedPath(entry.path)}`, { method: 'POST', headers: { 'content-type': entry.contentType, 'cache-control': entry.private ? 'max-age=0' : (entry.table ? 'max-age=60' : 'max-age=31536000'), 'x-upsert': 'false' }, body: bytes });
        if (!response.ok && ![400, 409].includes(response.status)) fail('object_upload_failed');
        if (!await verifiedObject(origin, entry)) fail('uploaded_object_missing');
      }
      if (entry.table) {
        const result = await client.query(`update asl.${entry.table} set ${entry.column}=$1 where id::text=$2 and ${entry.column}=$3 and ${predicate}`, [entry.destination, entry.id, entry.original, entry.private, entry.actor]);
        if (result.rowCount !== 1) {
          await matchingMedia(client, { ...entry, original: entry.destination }, predicate);
        }
      }
      entry.applied = true;
      await saveState(directory, state);
    }
  });
  report(state);
}

export async function selfCheck() {
  assert.deepEqual(imageType(Buffer.from([255, 216, 255, 0])), ['image/jpeg', 'jpg']);
  assert.deepEqual(imageType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), ['image/png', 'png']);
  assert.throws(() => imageType(Buffer.from('not an image')), /unsupported_image/);
  const gif = Buffer.from('474946383961010001000000003b', 'hex');
  assert.deepEqual(imageType(gif), ['image/gif', 'gif']);
  assert.throws(() => imageType(gif.subarray(0, -1)), /unsupported_image/);
  assert.equal(hash(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(encodedPath('accounts/a b/hash.jpg'), 'accounts/a%20b/hash.jpg');
  assert.throws(() => assertOutsideRepository(repo), /state_must_be_outside_repository/);
  assert.throws(() => assertOutsideRepository(path.join(repo, 'scratch')), /state_must_be_outside_repository/);
  assert.doesNotThrow(() => assertOutsideRepository('/private/tmp/napl-private-test'));
  await assert.rejects(discordImage('https://127.0.0.1/private'), /remote_host_rejected/);
  await assert.rejects(discordImage('https://user:pass@cdn.discordapp.com/image'), /remote_host_rejected/);
  // eslint-disable-next-line unicorn/prefer-https -- verify HTTP is rejected before DNS or a request
  await assert.rejects(discordImage('http://cdn.discordapp.com/image'), /remote_host_rejected/);
  await assert.rejects(discordImage('https://cdn.discordapp.com/image', 4), /remote_host_rejected/);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { mode: { type: 'string', default: 'prepare' }, state: { type: 'string' }, 'static-manifest': { type: 'string' } } });
    if (values.mode === 'self-check') { await selfCheck(); console.log('Storage migration self-check passed.'); }
    else {
      if (!values.state || !['prepare', 'retry', 'apply'].includes(values.mode)) fail('mode_and_private_state_required');
      const origin = new URL(process.env.SUPABASE_URL).origin;
      if (origin !== 'https://jvubotxbflumsuwvsfzv.supabase.co') fail('unexpected_project');
      const directory = await privateDirectory(path.resolve(values.state));
      if (values.mode === 'prepare') await prepare(directory, values['static-manifest'], origin);
      else if (values.mode === 'retry') await retry(directory, origin);
      else await apply(directory, origin);
    }
  } catch {
    // Never log raw errors: network/database messages may contain signed URLs or source values.
    console.error('Storage migration stopped; inspect the private state and rerun after resolving the failure.');
    process.exitCode = 1;
  }
}
