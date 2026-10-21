interface Invitation { username: string; status: string; respondedAt: number | null; }
export interface Team {
  id: string; name: string; tag: string; color: string; description: string; ownerUsername: string; members: string[];
  invitations: Invitation[]; pendingMembers: string[]; totw: boolean; totwSetAt: number | null; seasons: string[];
  formation: string; lineup: Record<string, string>; status: string; logoUrl: string | null; createdAt: number;
  reviewedAt: number | null; reviewedBy: string | null; rejectionReason: string | null;
}
export interface Transfer { id: string; season: string; playerUsername: string; fromTeamId: string | null; toTeamId: string | null; kind: string; windowType: string | null; createdAt: number | null; createdBy: string | null; }
export type TeamSummary = Pick<Team, 'id' | 'name' | 'tag' | 'color' | 'ownerUsername' | 'status' | 'logoUrl' | 'totw' | 'totwSetAt'> & Partial<Pick<Team, 'createdAt' | 'reviewedAt' | 'reviewedBy'>> & { memberCount?: number; invitationCount?: number; seasonCount?: number };
