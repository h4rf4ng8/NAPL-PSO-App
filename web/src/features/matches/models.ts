export interface MatchInfo { homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number; date: number; season: string; notes?: string; }
export interface PlayerStat { username: string; position: string; goals: number; assists: number; passes: number; tackles: number; deflects: number; catches: number; cleanSheet: boolean; }
export interface StatEdit { username: string; field: string; oldVal?: number | boolean | string; newVal: number | boolean | string; }
export interface Submission {
  id: string; status: string; submittedBy: string; submittedAt: number; reviewedBy?: string | null; reviewedAt?: number | null;
  rejectionReason?: string | null; matchInfo: MatchInfo; playerStats: PlayerStat[]; edits: StatEdit[]; linkedResultId?: string;
}
export interface ScheduledMatch {
  id: string; season: string; week: number; homeTeamId: string; awayTeamId: string; scheduledDate: number | null; streamUrl: string;
  matchType: string; playoffRound: string | null; status: string; homeScore: number | null; awayScore: number | null;
  linkedMatchId: string | null; notes: string; createdAt: number | null; updatedAt: number | null;
}
export interface ImportResult { matchId: string; updated: number; skipped: number; alreadyImported: number; skippedList: { strikersName: string; playerId: string; reason: string }[]; homeTeam?: string; awayTeam?: string; score: string; }
