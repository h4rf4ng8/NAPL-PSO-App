export interface News {
  id: string; type: string; title: string; body: string; pinned: boolean; homeTeamId: string | null; awayTeamId: string | null;
  homeScore: number | null; awayScore: number | null; date: number | null; notes: string; author: string; createdAt: number;
  autoFromSubmission?: string | null;
}
export interface Rule { id: string; title: string; body: string; sortOrder: number; createdAt: number; updatedAt: number; }
export interface Article { id: string; slug: string; title: string; coverImageUrl: string; author: string; body: string; excerpt: string; publishedAt: number | null; updatedAt: number | null; }
