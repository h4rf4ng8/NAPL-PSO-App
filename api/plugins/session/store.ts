export interface AuthLimit {
  key: string;
  count: number;
  windowMs: number;
}

export interface Admission {
  status: 'allowed' | 'limited' | 'capacity';
  retryAfter: number;
}

// Shared auth state only. Credential results are encrypted before storage.
export interface AuthStore {
  consumeLogin(digest: string): Promise<boolean>;
  readRefresh(key: string): Promise<string | null>;
  claimRefresh(sessionId: string, owner: string): Promise<boolean>;
  publishRefresh(sessionId: string, owner: string, key: string, sealed: string): Promise<boolean>;
  releaseRefresh(sessionId: string, owner: string): Promise<void>;
  admit(limits: readonly AuthLimit[]): Promise<Admission>;
}
