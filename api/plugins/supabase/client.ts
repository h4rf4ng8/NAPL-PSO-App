import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Config } from '../cfg.js';
import { GatewayError } from '../auth/errors.js';
import type { Identity } from '../session/model.js';

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  provider_token: z.string().optional(),
  provider_refresh_token: z.string().optional(),
  user: z.object({
    id: z.string().uuid(),
    identities: z.array(z.object({
      provider: z.string(),
      identity_data: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
  }).optional(),
});
export type SupabaseTokens = z.infer<typeof tokensSchema>;

export interface SupabaseAuth {
  verify(token: string): Promise<Identity>;
  loginUrl(challenge: string, transaction: string): string;
  exchange(code: string, verifier: string, ip: string): Promise<SupabaseTokens>;
  refresh(token: string, ip: string): Promise<SupabaseTokens>;
  logout(token: string, ip: string): Promise<void>;
}

export class SupabaseClient implements SupabaseAuth {
  private readonly jwks;
  private readonly authUrl: string;

  constructor(private readonly config: Config) {
    const url = new URL(config.SUPABASE_URL);
    // Local Compose exposes GoTrue directly; hosted project roots use /auth/v1.
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
      return {
        userId: z.string().uuid().parse(payload.sub),
        sessionId: z.string().uuid().parse(payload.session_id),
        expiresAt: z.number().int().positive().parse(payload.exp),
        claims: payload,
      };
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : '';
      if (code === 'ERR_JWT_EXPIRED') throw new GatewayError(401, 'session_expired');
      if (code === 'ERR_JWKS_TIMEOUT' || error instanceof TypeError) throw new GatewayError(503, 'identity_provider_unavailable', 1);
      throw new GatewayError(401, 'session_invalid');
    }
  }

  loginUrl(challenge: string, transaction: string): string {
    const url = new URL(`${this.authUrl}/authorize`);
    url.search = new URLSearchParams({
      provider: 'discord',
      scopes: 'identify email guilds.members.read',
      redirect_to: `${this.config.PUBLIC_ORIGIN}/auth/callback?transaction=${transaction}`,
      code_challenge: challenge,
      code_challenge_method: 's256',
    }).toString();
    return url.href;
  }

  async exchange(code: string, verifier: string, ip: string): Promise<SupabaseTokens> {
    return this.token('pkce', { auth_code: code, code_verifier: verifier }, ip);
  }

  async refresh(token: string, ip: string): Promise<SupabaseTokens> {
    return this.token('refresh_token', { refresh_token: token }, ip);
  }

  async logout(token: string, ip: string): Promise<void> {
    const response = await this.request('/logout?scope=local', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, ip);
    if (!response.ok && response.status !== 401) throw new GatewayError(503, 'logout_unavailable', 1);
  }

  private async token(grant: string, body: Record<string, string>, ip: string): Promise<SupabaseTokens> {
    const response = await this.request(`/token?grant_type=${grant}`, { method: 'POST', body: JSON.stringify(body) }, ip);
    if (response.status === 400 || response.status === 401) throw new GatewayError(401, 'login_required');
    if (response.status === 429) throw new GatewayError(429, 'identity_provider_rate_limited', 60);
    if (!response.ok) throw new GatewayError(503, 'identity_provider_unavailable', 1);
    return tokensSchema.parse(await response.json() as unknown);
  }

  private async request(path: string, init: RequestInit, ip: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.config.SUPABASE_SECRET_KEY ?? this.config.SUPABASE_PUBLISHABLE_KEY);
    headers.set('Content-Type', 'application/json');
    if (this.config.SUPABASE_SECRET_KEY) headers.set('Sb-Forwarded-For', ip);
    try {
      return await fetch(`${this.authUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(4000), redirect: 'error' });
    } catch {
      throw new GatewayError(503, 'identity_provider_unavailable', 1);
    }
  }
}
