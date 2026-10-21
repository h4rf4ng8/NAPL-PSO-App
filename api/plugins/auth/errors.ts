export class GatewayError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 429 | 503,
    public readonly code: string,
    public readonly retryAfter?: number,
    public readonly upstream?: { dependency: 'supabase' | 'discord'; operation: 'verify' | 'user' | 'identity' | 'notification'; failure: 'timeout' | 'network' | 'http' | 'schema'; status?: number },
  ) {
    super(code);
  }
}
