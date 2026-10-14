import { randomBytes } from 'node:crypto';
import { chmod, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CookieCrypto } from '../plugins/session/crypto.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const examplePath = path.resolve(scriptDir, '../.env.example');
const defaultEnvPath = path.resolve(scriptDir, '../.env');
const placeholder = 'REPLACE_WITH_A_JSON_KEY_RING';

function cookieAssignment(contents) {
  const lines = contents.split(/(?<=\n)/);
  const matches = [];
  for (const [index, line] of lines.entries()) {
    if (/^\s*(?:export\s+)?COOKIE_KEYS\s*=/.test(line)) matches.push(index);
  }
  if (matches.length > 1) throw new Error('Multiple COOKIE_KEYS entries found in env file');
  return matches[0];
}

function validateKeyRing(encoded) {
  try { new CookieCrypto(encoded); }
  catch (error) {
    throw new Error('COOKIE_KEYS must be a valid JSON key ring of 32-byte base64 keys', { cause: error });
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

export async function setupEnv(envPath = defaultEnvPath, sourcePath = examplePath, environment = process.env) {
  const target = path.resolve(envPath);
  const lockPath = `${target}.setup-lock`;
  const lock = await acquireLock(lockPath);
  try {
    let contents;
    try { contents = await readFile(target, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      contents = await readFile(sourcePath, 'utf8');
      try { await writeFile(target, contents, { flag: 'wx', mode: 0o600 }); }
      catch (writeError) {
        if (writeError.code !== 'EEXIST') throw writeError;
        contents = await readFile(target, 'utf8');
      }
    }

    await chmod(target, 0o600);
    const parsed = parseEnv(contents);
    const assignment = cookieAssignment(contents);
    const injected = environment.COOKIE_KEYS;
    if (injected !== undefined) {
      validateKeyRing(injected);
      return 'Using injected COOKIE_KEYS';
    }
    if (assignment !== undefined && parsed.COOKIE_KEYS === undefined) throw new Error('COOKIE_KEYS is malformed');
    if (assignment !== undefined && parsed.COOKIE_KEYS && parsed.COOKIE_KEYS !== placeholder) {
      validateKeyRing(parsed.COOKIE_KEYS);
      return 'Existing COOKIE_KEYS preserved';
    }

    const generated = JSON.stringify({ v1: randomBytes(32).toString('base64') });
    const updated = contents.split(/(?<=\n)/);
    if (assignment === undefined) {
      const separator = contents && !contents.endsWith('\n') ? '\n' : '';
      updated.push(`${separator}COOKIE_KEYS='${generated}'\n`);
    } else {
      const originalLine = updated[assignment];
      let newline = '';
      if (originalLine.endsWith('\r\n')) newline = '\r\n';
      else if (originalLine.endsWith('\n')) newline = '\n';
      const prefix = originalLine.match(/^(\s*(?:export\s+)?COOKIE_KEYS\s*=\s*)/)?.[1] ?? 'COOKIE_KEYS=';
      updated[assignment] = `${prefix}'${generated}'${newline}`;
    }
    const tempPath = `${target}.${process.pid}.tmp`;
    await writeFile(tempPath, updated.join(''), { flag: 'wx', mode: 0o600 });
    await rename(tempPath, target);
    await chmod(target, 0o600);
    return 'Generated COOKIE_KEYS';
  } finally {
    await lock.close();
    try { await unlink(lockPath); } catch { /* lock may already be gone */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await setupEnv();
    process.stdout.write(`${result} in api/.env\n`);
  } catch (error) {
    process.stderr.write(`Environment setup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
