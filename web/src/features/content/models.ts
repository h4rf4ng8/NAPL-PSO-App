import { z } from 'zod';
export interface News {
  id: string; type: string; title: string; body: string; pinned: boolean; homeTeamId: string | null; awayTeamId: string | null;
  homeScore: number | null; awayScore: number | null; date: number | null; notes: string; author: string; createdAt: number;
  autoFromSubmission?: string | null;
}
export interface Rule { id: string; title: string; body: string; sortOrder: number; createdAt: number; updatedAt: number; }
export interface Article { id: string; slug: string; title: string; coverImageUrl: string; author: string; body: string; excerpt: string; publishedAt: number | null; updatedAt: number | null; }
export type NewsSummary = Omit<News, 'body' | 'notes'> & { bodyUrl: string; notesUrl: string };
export type ArticleSummary = Omit<Article, 'body' | 'excerpt'> & { bodyUrl: string; excerptUrl: string };
export type RuleSummary = Omit<Rule, 'body'> & { bodyUrl: string };

export const newsSummarySchema = z.object({
  id: z.string(), type: z.string(), title: z.string(), pinned: z.boolean(),
  homeTeamId: z.string().nullable(), awayTeamId: z.string().nullable(),
  homeScore: z.number().nullable(), awayScore: z.number().nullable(), date: z.number().nullable(),
  author: z.string(), createdAt: z.number().nullable().transform(value => value === null ? 0 : value), autoFromSubmission: z.string().nullable().optional(),
  bodyUrl: z.string(), notesUrl: z.string(),
  homeTeam: z.object({ id: z.string(), name: z.string(), tag: z.string(), color: z.string().nullable() }).nullable().optional(),
  awayTeam: z.object({ id: z.string(), name: z.string(), tag: z.string(), color: z.string().nullable() }).nullable().optional(),
});

