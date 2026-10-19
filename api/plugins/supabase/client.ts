import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Config } from '../cfg.js';
import { GatewayError } from '../auth/errors.js';
import type { Identity } from '../auth/identity.js';

const userSchema = z.object({
  id: z.uuid(),
  identities: z.array(z.object({ provider: z.string(), id: z.string().min(1) })).default([]),
});
export type SupabaseUser = z.infer<typeof userSchema>;
export interface SupabaseAuth {
  verify(token: string): Promise<Identity>;
  user(token: string): Promise<SupabaseUser>;
}

export class SupabaseClient implements SupabaseAuth {
  private readonly jwks;
  private readonly authUrl: string;

  constructor(private readonly config: Config) {
    const url = new URL(config.SUPABASE_URL);
    // Standalone/test Auth uses loopback roots; hosted project roots use /auth/v1.
    if (url.pathname === '/' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) url.pathname = '/auth/v1';
    this.authUrl = url.href.replace(/\/$/, '');
    this.jwks = createRemoteJWKSet(new URL(config.SUPABASE_JWKS_URL), { timeoutDuration: 3000 });
  }

  async verify(token: string): Promise<Identity> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.authUrl,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
        requiredClaims: ['sub', 'exp', 'session_id'],
      });
      return { id: z.uuid().parse(payload.sub), sessionId: z.uuid().parse(payload.session_id), claims: payload };
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : '';
      if (error instanceof errors.JWTExpired && error.claim === 'exp' && z.uuid().safeParse(error.payload.sub).success && z.uuid().safeParse(error.payload.session_id).success) throw new GatewayError(401, 'access_expired');
      if (code === 'ERR_JWKS_TIMEOUT' || error instanceof TypeError) throw new GatewayError(503, 'identity_provider_unavailable', 1, { dependency: 'supabase', operation: 'verify', failure: code === 'ERR_JWKS_TIMEOUT' ? 'timeout' : 'network' });
      throw new GatewayError(401, 'access_invalid');
    }
  }

  async user(token: string): Promise<SupabaseUser> {
    try {
      const response = await fetch(`${this.authUrl}/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: this.config.SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(4000), redirect: 'error',
      });
      if (response.status === 401 || response.status === 403) throw new GatewayError(401, 'access_invalid');
      if (response.status === 429) throw new GatewayError(429, 'identity_provider_rate_limited', 60, { dependency: 'supabase', operation: 'user', failure: 'http', status: response.status });
      if (!response.ok) throw new GatewayError(503, 'identity_provider_unavailable', 1, { dependency: 'supabase', operation: 'user', failure: 'http', status: response.status });
      return userSchema.parse(await response.json() as unknown);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(503, 'identity_provider_unavailable', 1, { dependency: 'supabase', operation: 'user', failure: error instanceof z.ZodError || error instanceof SyntaxError ? 'schema' : (error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network') });
    }
  }
}
