import { z } from 'zod';

export const sessionSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  discordUserId: z.string().regex(/^\d+$/),
  supabaseRefresh: z.string().min(1),
  discordAccess: z.string().min(1),
  discordRefresh: z.string().min(1),
  accessExpiresAt: z.number().int().positive(),
  discordExpiresAt: z.number().int().positive().nullable(),
  expiresAt: z.number().int().positive(),
});
export type Session = z.infer<typeof sessionSchema>;

export const transactionSchema = z.object({
  id: z.string().min(32),
  verifier: z.string().min(43),
  expiresAt: z.number().int().positive(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export interface Identity {
  userId: string;
  sessionId: string;
  expiresAt: number;
  claims?: import('jose').JWTPayload;
}
