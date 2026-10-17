import { z } from 'zod';
import type { Config } from '../cfg.js';
import { GatewayError } from '../auth/errors.js';

export const discordTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.int().positive(),
  scope: z.string(),
});
export type DiscordTokens = z.infer<typeof discordTokensSchema>;

export interface DiscordAuth {
  refresh(token: string): Promise<DiscordTokens>;
  identity(token: string): Promise<string>;
  membership(token: string, expectedUser: string): Promise<boolean>;
}

export class DiscordClient implements DiscordAuth {
  constructor(private readonly config: Config) {}

  async refresh(token: string): Promise<DiscordTokens> {
    const response = await this.request('/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.DISCORD_CLIENT_ID,
        client_secret: this.config.DISCORD_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: token,
      }),
    });
    const result = discordTokensSchema.parse(await response.json() as unknown);
    if (!result.scope.split(' ').includes('guilds.members.read')) throw new GatewayError(401, 'discord_consent_required');
    return result;
  }

  async identity(token: string): Promise<string> {
    const response = await this.request('/users/@me', { headers: { Authorization: `Bearer ${token}` } });
    return z.object({ id: z.string().regex(/^\d+$/) }).parse(await response.json() as unknown).id;
  }

  async membership(token: string, expectedUser: string): Promise<boolean> {
    const response = await this.request(`/users/@me/guilds/${this.config.DISCORD_GUILD_ID}/member`, { headers: { Authorization: `Bearer ${token}` } }, true);
    if (response.status === 404) return false;
    const member = z.object({ pending: z.boolean().optional(), user: z.object({ id: z.string() }).optional() }).parse(await response.json() as unknown);
    if (member.user && member.user.id !== expectedUser) throw new GatewayError(401, 'discord_identity_mismatch');
    return member.pending !== true;
  }

  private async request(path: string, init: RequestInit, allowNotFound = false): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`https://discord.com/api/v10${path}`, { ...init, signal: AbortSignal.timeout(4000), redirect: 'error' });
    } catch {
      throw new GatewayError(503, 'discord_unavailable', 1);
    }
    if (response.status === 429) throw new GatewayError(429, 'discord_rate_limited', 60);
    if ([401, 403, 400].includes(response.status)) throw new GatewayError(401, 'discord_consent_required');
    if (!response.ok && !(allowNotFound && response.status === 404)) throw new GatewayError(503, 'discord_unavailable', 1);
    return response;
  }
}
