import { randomBytes, randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CookieCrypto } from '../plugins/session/crypto.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const apiKeys = ['COOKIE_KEYS', 'ORIGIN_SECRET'];
const missing = value => !value?.trim() || value.startsWith('REPLACE_');

async function readEnv(file) {
  let contents;
  try { contents = await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    contents = await readFile(`${file}.example`, 'utf8');
  }
  const values = parseEnv(contents);
  const names = new Set();
  for (const match of contents.matchAll(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=/gm)) {
    const name = match[1];
    if (names.has(name)) throw new Error(`Multiple ${name} entries in ${path.basename(path.dirname(file))}/.env`);
    if (values[name] === undefined) throw new Error(`${name} is malformed`);
    names.add(name);
  }
  return { file, contents, values };
}

function setValue(env, name, value) {
  const line = `${name}='${value}'`;
  if (value.includes('\n') || parseEnv(line)[name] !== value) throw new Error(`${name} must fit on one quoted line`);
  const assignment = new RegExp(String.raw`^([\t ]*(?:export[\t ]+)?${name}[\t ]*=[\t ]*)[^\r\n]*`, 'm');
  env.contents = assignment.test(env.contents)
    ? env.contents.replace(assignment, () => line)
    : `${env.contents}${env.contents && !env.contents.endsWith('\n') ? '\n' : ''}${line}\n`;
  env.values[name] = value;
}

function validate(name, value) {
  try {
    if (name === 'COOKIE_KEYS') {
      new CookieCrypto(value);
    } else if (value.length < 32) {
      throw new Error('Secret must have at least 32 characters');
    }
  } catch {
    throw new Error(`${name} is invalid`);
  }
}

async function acquireLock(lockPath) {
  const deadline = Date.now() + 5000;
  while (true) {
    try { return await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw new Error('Could not acquire env setup lock', { cause: error });
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
}

export async function setupEnv(root = repoRoot) {
  const lockPath = path.resolve(root, 'api/.env.setup-lock');
  const lock = await acquireLock(lockPath);
  const temporaryFiles = [];
  try {
    const api = await readEnv(path.resolve(root, 'api/.env'));
    const web = await readEnv(path.resolve(root, 'web/.env'));
    if (['COOKIE_KEYS', 'GOTRUE_JWT_SECRET', 'GOTRUE_JWT_KEYS', 'DISCORD_CLIENT_SECRET', 'SUPABASE_SECRET_KEY', 'DATABASE_URL'].some(name => Object.hasOwn(web.values, name))) {
      throw new Error('API and Auth secrets belong in api/.env, not web/.env');
    }
    for (const name of apiKeys) if (!missing(api.values[name])) validate(name, api.values[name]);
    if (!missing(web.values.ORIGIN_SECRET)) {
      validate('ORIGIN_SECRET', web.values.ORIGIN_SECRET);
      if (!missing(api.values.ORIGIN_SECRET) && api.values.ORIGIN_SECRET !== web.values.ORIGIN_SECRET) {
        throw new Error('ORIGIN_SECRET differs between api/.env and web/.env');
      }
    }
    for (const name of apiKeys) {
      if (!missing(api.values[name])) continue;
      let value;
      if (name === 'COOKIE_KEYS') {
        value = JSON.stringify({ local: randomBytes(32).toString('base64') });
      } else {
        value = missing(web.values.ORIGIN_SECRET)
          ? randomBytes(32).toString('hex') : web.values.ORIGIN_SECRET;
      }
      setValue(api, name, value);
    }
    if (missing(web.values.ORIGIN_SECRET)) setValue(web, 'ORIGIN_SECRET', api.values.ORIGIN_SECRET);

    // Validate both files before replacing either; the lock serializes setup calls.
    for (const env of [api, web]) {
      const temporary = `${env.file}.${randomUUID()}.tmp`;
      temporaryFiles.push(temporary);
      await writeFile(temporary, env.contents, { flag: 'wx', mode: 0o600 });
    }
    await rename(temporaryFiles[0], api.file);
    await rename(temporaryFiles[1], web.file);
  } finally {
    await Promise.all(temporaryFiles.map(file => rm(file, { force: true })));
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await setupEnv();
    process.stdout.write('Configured api/.env and web/.env; existing keys preserved.\n');
  } catch (error) {
    process.stderr.write(`Environment setup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
