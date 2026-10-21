import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../load/run-staging.mjs', import.meta.url));
test('staging load runner accepts regional Function URLs but stops before traffic without a budget', () => {
  for (const region of ['us-east-2', 'us-west-2', 'eu-central-1']) {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: {
      ...process.env, LOAD_STAGE: 'staging', LOAD_BASE_URL: `https://example.lambda-url.${region}.on.aws`, LOAD_DB_CONNECTION_BUDGET: '',
    } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Set LOAD_DB_CONNECTION_BUDGET/, `${region} must reach the pre-traffic budget guard`);
  }
});
test('staging load runner rejects unexpected hosts before traffic', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: {
    ...process.env, LOAD_STAGE: 'staging', LOAD_BASE_URL: 'https://example.lambda-url.us-east-2.on.aws.attacker.test', LOAD_DB_CONNECTION_BUDGET: '1',
  } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing load traffic/);
});
