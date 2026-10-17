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
    const url = 'https://project.supabase.co/auth/v1';
    const jwksUrl = `http://127.0.0.1:${address.port}/auth/v1/.well-known/jwks.json`;
    const client = new SupabaseClient({ ...config, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_JWKS_URL: jwksUrl });
    const verify = client.verify.bind(client);
    const token = async (overrides: Record<string, unknown> = {}) => new SignJWT({
        sub: user, session_id: user, iss: url, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60, ...overrides
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
                iss: 'https://project.supabase.co'
            }, {
                iss: jwksUrl
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

for (const authPath of ['', '/auth/v1']) {
    test(`Auth requests and issuer use the configured URL (${authPath || '/'}); JWKS uses its own endpoint`, async () => {
        const { publicKey, privateKey } = await generateKeyPair('ES256');
        const jwk = await exportJWK(publicKey);
        const requests: string[] = [];
        const server = createServer((request, response) => {
            requests.push(request.url ?? '');
            response.setHeader('content-type', 'application/json');
            if (request.url === '/keys') {
                response.end(JSON.stringify({ keys: [{ ...jwk, kid: 'local', alg: 'ES256', use: 'sig' }] }));
            } else if (request.url === `${authPath}/logout?scope=local`) {
                response.writeHead(204).end();
            } else {
                response.end(JSON.stringify({ access_token: 'access', refresh_token: 'refresh' }));
            }
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const publicUrl = `http://127.0.0.1:${address.port}${authPath}`;
        const jwksUrl = `http://127.0.0.1:${address.port}/keys`;
        const client = new SupabaseClient({ ...config, SUPABASE_URL: `${publicUrl}/`, SUPABASE_JWKS_URL: jwksUrl });
        const token = (issuer: string) => new SignJWT({ session_id: user })
            .setSubject(user).setIssuer(issuer).setAudience('authenticated').setExpirationTime('1m')
            .setProtectedHeader({ alg: 'ES256', kid: 'local' }).sign(privateKey);
        try {
            const login = new URL(client.loginUrl('challenge', 'transaction'));
            assert.equal(login.origin, new URL(publicUrl).origin);
            assert.equal(login.pathname, `${authPath}/authorize`);
            assert.equal(login.searchParams.get('redirect_to'), `${config.PUBLIC_ORIGIN}/auth/callback?transaction=transaction`);
            assert.equal((await client.verify(await token(publicUrl))).userId, user);
            await assert.rejects(async () => client.verify(await token(jwksUrl)), /session_invalid/);
            assert.equal((await client.exchange('code', 'verifier', '127.0.0.1')).access_token, 'access');
            assert.equal((await client.refresh('refresh', '127.0.0.1')).refresh_token, 'refresh');
            await client.logout('access', '127.0.0.1');
            assert.deepEqual(requests, [
                '/keys',
                `${authPath}/token?grant_type=pkce`,
                `${authPath}/token?grant_type=refresh_token`,
                `${authPath}/logout?scope=local`,
            ]);
        } finally {
            await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
    });
}

test('project roots use /auth/v1 while direct local Auth uses its root', () => {
    for (const [url, authUrl] of [
        ['https://project.supabase.co', 'https://project.supabase.co/auth/v1'],
        ['https://project.supabase.co/', 'https://project.supabase.co/auth/v1'],
        ['https://auth.example.test', 'https://auth.example.test/auth/v1'],
        ['https://project.supabase.co/auth/v1/', 'https://project.supabase.co/auth/v1'],
        ['http://localhost:54321', 'http://localhost:54321'],
        ['http://127.0.0.1:54321', 'http://127.0.0.1:54321'],
        ['http://[::1]:54321', 'http://[::1]:54321'],
    ] as const) {
        const client = new SupabaseClient({ ...config, NODE_ENV: 'development', SUPABASE_URL: url });
        assert.equal(new URL(client.loginUrl('challenge', 'transaction')).href.split('?', 1)[0], `${authUrl}/authorize`);
    }
});
