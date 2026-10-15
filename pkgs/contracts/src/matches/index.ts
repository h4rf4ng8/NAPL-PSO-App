import { z } from 'zod';

export const teamRecordsSchema = z.array(z.object({
  teamId: z.string(), season: z.string(), played: z.number().finite(), w: z.number().finite(), d: z.number().finite(),
  l: z.number().finite(), gf: z.number().finite(), ga: z.number().finite(), gd: z.number().finite(), pts: z.number().finite(),
}));

export type TeamRecord = z.infer<typeof teamRecordsSchema>[number];
