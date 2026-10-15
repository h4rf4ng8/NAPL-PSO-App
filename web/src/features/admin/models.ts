export type Role = 'admin' | 'super_admin';
export const isRole = (value: string): value is Role => value === 'admin' || value === 'super_admin';
export interface RoleAssignment { userId: string; username: string; role: Role; }
export type Weightings = Record<string, Record<string, number>>;
export type Champions = Record<string, { winnerTeamId: string | null; runnerUpTeamId: string | null; setAt: number }>;
