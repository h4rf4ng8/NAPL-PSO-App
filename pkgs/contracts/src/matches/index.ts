import { z } from 'zod';

export const teamRecordsSchema = z.array(z.object({
  teamId: z.string(), season: z.string(), played: z.number(), w: z.number(), d: z.number(),
  l: z.number(), gf: z.number(), ga: z.number(), gd: z.number(), pts: z.number(),
}));

export type TeamRecord = z.infer<typeof teamRecordsSchema>[number];
