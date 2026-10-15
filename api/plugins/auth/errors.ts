export class GatewayError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 429 | 503,
    public readonly code: string,
    public readonly retryAfter?: number,
  ) {
    super(code);
  }
}
