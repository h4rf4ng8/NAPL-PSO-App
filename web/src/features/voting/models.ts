export interface VotingPeriod { id: string; opensAt: number; closesAt: number; status: string; eligiblePlayers: string[]; winners: Record<string, string> | null; createdBy: string; createdAt: number; resolvedAt: number | null; }
export interface Vote { id: string; periodId: string; voterUsername: string; position: string; votedForUsername: string; votedAt: number; }
