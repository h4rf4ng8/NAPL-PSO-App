import { z } from 'zod';

export const sessionSchema = z.object({
  userId: z.uuid(),
  sessionId: z.uuid(),
  discordUserId: z.string().regex(/^\d+$/),
  supabaseRefresh: z.string().min(1),
  discordAccess: z.string().min(1),
  discordRefresh: z.string().min(1),
  accessExpiresAt: z.int().positive(),
  discordExpiresAt: z.int().positive().nullable(),
  expiresAt: z.int().positive(),
});
export type Session = z.infer<typeof sessionSchema>;

export const transactionSchema = z.object({
  id: z.string().min(32),
  verifier: z.string().min(43),
  expiresAt: z.int().positive(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export interface Identity {
  userId: string;
  sessionId: string;
  expiresAt: number;
  claims?: import('jose').JWTPayload;
}
