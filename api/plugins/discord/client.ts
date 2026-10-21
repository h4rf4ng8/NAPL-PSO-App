import { z } from 'zod';
import { GatewayError } from '../auth/errors.js';

const discordProfileSchema = z.object({
  id: z.string().regex(/^\d+$/),
  username: z.string().min(2).max(32).regex(/^[a-z0-9_.]+$/),
});
export type DiscordProfile = z.infer<typeof discordProfileSchema>;
export interface DiscordAuth {
  identity(token: string): Promise<DiscordProfile>;
}

export class DiscordClient implements DiscordAuth {
  async identity(token: string): Promise<DiscordProfile> {
    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000), redirect: 'error',
      });
      if (response.status === 429) throw new GatewayError(429, 'discord_rate_limited', 60, { dependency: 'discord', operation: 'identity', failure: 'http', status: response.status });
      if ([401, 403, 400].includes(response.status)) throw new GatewayError(401, 'discord_consent_required');
      if (!response.ok) throw new GatewayError(503, 'discord_unavailable', 1, { dependency: 'discord', operation: 'identity', failure: 'http', status: response.status });
      return discordProfileSchema.parse(await response.json() as unknown);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(503, 'discord_unavailable', 1, { dependency: 'discord', operation: 'identity', failure: error instanceof z.ZodError || error instanceof SyntaxError ? 'schema' : (error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network') });
    }
  }
}
