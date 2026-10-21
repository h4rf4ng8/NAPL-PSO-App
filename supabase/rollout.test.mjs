import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ref = 'jvubotxbflumsuwvsfzv';
test('rollout plan is private and records only applied migrations; deceptive endpoints fail before connecting', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'asl-rollout-test-'));
  try {
    const manifest = path.join(directory, 'manifest.json'), plan = path.join(directory, 'plan.sql');
    await writeFile(manifest, JSON.stringify({ project_ref: ref, account_aliases: {}, excluded_team_ids: [], excluded_vote_ids: [], initial_admin_ids: ['00000000-0000-4000-8000-000000000000'] }));
    const run = (args, env = {}) => spawnSync(process.execPath, ['supabase/rollout.mjs', manifest, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    const result = run(['--plan', plan]);
    assert.equal(result.status, 0, result.stderr);
    const planStat = await stat(plan);
    assert.equal(planStat.mode & 0o777, 0o600);
    const sql = await readFile(plan, 'utf8');
    assert.equal((sql.match(/INSERT INTO supabase_migrations.schema_migrations VALUES/g) ?? []).length, 5);
    assert.doesNotMatch(sql, /DELETE FROM public\.settings/);
    assert.doesNotMatch(sql, /VALUES \('202610130002'/);
    assert.match(sql, /INSERT INTO auth_gateway\.user_roles/);
    for (const endpoint of [
      `postgresql://postgres@db.${ref}.supabase.co.wrong.example/postgres`,
      `postgresql://postgres.${ref}@wrong.example/postgres`,
      `postgresql://postgres.wrong@aws-1-region.pooler.supabase.com/postgres`,
    ]) {
      const rejected = run(['--execute'], { SUPABASE_URL: `https://${ref}.supabase.co`, ROLLOUT_DATABASE_URL: endpoint });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /Database endpoint must identify/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
