export interface AuthLimit {
  key: string;
  count: number;
  windowMs: number;
}
export interface Admission {
  status: 'allowed' | 'limited' | 'capacity';
  retryAfter: number;
}
export interface AuthStore {
  admit(limits: readonly AuthLimit[]): Promise<Admission>;
}
