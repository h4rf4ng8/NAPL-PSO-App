import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('local startup preserves app configs and forwards Compose arguments and failures', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'napl-local-startup-'));
  try {
    const scripts = path.join(directory, 'scripts');
    const bin = path.join(directory, 'bin');
    await mkdir(scripts);
    await mkdir(bin);
    await mkdir(path.join(directory, 'api'));
    await mkdir(path.join(directory, 'web'));
    const launcher = path.join(scripts, 'dev.sh');
    await copyFile(new URL('../../../scripts/dev.sh', import.meta.url), launcher);
    const apiConfig = path.join(directory, 'api/.env');
    const webConfig = path.join(directory, 'web/.env');
    await writeFile(apiConfig, 'DISCORD_CLIENT_SECRET=preserved\n');
    await writeFile(webConfig, 'ORIGIN_SECRET=preserved\n');
    await writeFile(path.join(bin, 'docker'), '#!/bin/sh\npwd\nprintf "%s\\n" "$@"\nexit "${DOCKER_EXIT_CODE:-0}"\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const first = spawnSync('sh', [launcher, '-d'], { cwd: scripts, env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, `${directory}\ncompose\n--env-file\napi/.env\nup\n--build\n-d\n`);
    const second = spawnSync('sh', [launcher, '--wait'], {
      cwd: bin,
      env: { ...env, DOCKER_EXIT_CODE: '23' },
      encoding: 'utf8',
    });
    assert.equal(second.status, 23);
    assert.equal(second.stdout, `${directory}\ncompose\n--env-file\napi/.env\nup\n--build\n--wait\n`);
    assert.equal(await readFile(apiConfig, 'utf8'), 'DISCORD_CLIENT_SECRET=preserved\n');
    assert.equal(await readFile(webConfig, 'utf8'), 'ORIGIN_SECRET=preserved\n');
    await assert.rejects(readFile(path.join(directory, '.env')), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
