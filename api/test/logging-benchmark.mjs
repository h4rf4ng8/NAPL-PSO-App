import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loggingFixture } from './plugins/logging-fixture.js';

// The same injected traffic and dependency failures run against either checkout.
const source = loggingFixture + `
  try {
    const statuses = [];
    for (let index = 0; index < 10; index++) {
      statuses.push((await app.inject({method:'POST',url:'/api/default-position-weights',headers:{'content-type':'application/json'},payload:{variables:{}}})).statusCode);
      statuses.push((await app.inject({method:'POST',url:'/api/users/me',headers:{authorization:'Bearer '+canaries.bearer},payload:{providerToken:canaries.provider}})).statusCode);
      statuses.push((await app.inject({url:'/api/users/me'})).statusCode);
    }
    console.error(JSON.stringify(statuses));
  } finally { await app.close(); }
`;
const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
  cwd: process.argv[2] ?? new URL('../', import.meta.url), encoding: 'utf8', timeout: 15_000,
});
assert.equal(result.status, 0, result.stderr);
assert.deepEqual(JSON.parse(result.stderr), Array.from({length:10}, () => [200,503,401]).flat());
const requests = new Map();
const lines = result.stdout.split('\n').filter(Boolean);
for (const line of lines) {
  const event = JSON.parse(line);
  const id = event.request_id ?? event.reqId;
  assert.ok(id, 'every benchmark event must belong to a request');
  const request = requests.get(id) ?? {status:undefined,bytes:0,events:0};
  request.status = event.status ?? event.res?.statusCode ?? request.status;
  request.bytes += Buffer.byteLength(line + '\n');
  request.events++;
  requests.set(id, request);
}
assert.equal(requests.size, 30);
const byStatus = {};
for (const request of requests.values()) {
  assert.ok([200,401,503].includes(request.status));
  const group = byStatus[request.status] ?? {requests:0,events:0,bytes:0};
  group.requests++;
  group.events += request.events;
  group.bytes += request.bytes;
  byStatus[request.status] = group;
}
console.log(JSON.stringify({requests:requests.size,events:lines.length,stdout_bytes:Buffer.byteLength(result.stdout),by_status:byStatus}, null, 2));
