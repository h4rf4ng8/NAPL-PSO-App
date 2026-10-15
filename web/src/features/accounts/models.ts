import type { Role } from '../admin/models';
import type { Team } from '../teams/models';
import type { AccountStats, Championship, Match, PlayerAward, SeasonStats } from '@napl/contracts/accounts';

export type { Championship, Match, PlayerAward } from '@napl/contracts/accounts';

export type Stats = AccountStats;
export interface Account {
  id: string; username: string; position: string; teamId: string | null; imageUrl: string | null; pendingImageUrl?: string | null;
  email?: string | null; country: string | null; stats: Stats; seasonStats?: SeasonStats; matches?: Match[]; awards: PlayerAward[]; championships: Championship[];
  totwUntil: number | null; cheater: boolean; strikersId: string | null; steamUrl: string | null; createdAt: number; roles?: Role[];
  _team?: Team; _seasonStats?: Stats; _overall?: number; _unranked?: boolean;
}
export interface PositionRequest { id: string; accountId: string; username: string; fromPos: string; toPos: string; reason: string; status: string; reviewedBy: string | null; reviewedAt: number | null; reviewNote: string; createdAt: number | null; }
export interface Ranking { score: number; percentile: number; ranked: boolean; gamesPlayed: number; tier?: string; }
export type Rankings = Map<string, Ranking>;
export interface Attributes { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number; [key: string]: number; }
