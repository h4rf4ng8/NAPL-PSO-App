import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { SupabaseClient } from '../../plugins/supabase/client.js';
import { config } from './fixtures.js';
const user = '11111111-1111-4111-8111-111111111111';
test('merged API verifier requires signatures, expiry, issuer, audience and session', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = await exportJWK(publicKey);
    const server = createServer((request, res) => {
        assert.equal(request.url, '/auth/v1/.well-known/jwks.json');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
            keys: [{
                    ...jwk, kid: 'test', alg: 'ES256', use: 'sig'
                }]
        }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const url = `http://127.0.0.1:${address.port}`;
    const client = new SupabaseClient({ ...config, SUPABASE_URL: url });
    const verify = client.verify.bind(client);
    const token = async (overrides: Record<string, unknown> = {}) => new SignJWT({
        sub: user, session_id: user, iss: `${url}/auth/v1`, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60, ...overrides
    }).setProtectedHeader({
        alg: 'ES256', kid: 'test'
    }).sign(privateKey);
    try {
        assert.equal((await verify(await token())).userId, user);
        for (const override of [{
                exp: undefined
            }, {
                exp: 0
            }, {
                session_id: undefined
            }, {
                sub: undefined
            }, {
                iss: 'https://evil.example'
            }, {
                aud: 'different'
            }])
            await assert.rejects(async () => verify(await token(override)));
        const valid = await token();
        await assert.rejects(() => verify(valid.slice(0, -4) + 'xxxx'));
    }
    finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
