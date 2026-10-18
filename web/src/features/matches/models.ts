export interface ScheduledMatch {
  id: string; season: string; week: number; homeTeamId: string; awayTeamId: string; scheduledDate: number | null; streamUrl: string;
  matchType: string; playoffRound: string | null; status: string; homeScore: number | null; awayScore: number | null;
  linkedMatchId: string | null; notes: string; createdAt: number | null; updatedAt: number | null;
}
export interface ImportResult { matchId: string; updated: number; skipped: number; alreadyImported: number; skippedList: { strikersName: string; playerId: string; reason: string }[]; homeTeam?: string; awayTeam?: string; score: string; }
