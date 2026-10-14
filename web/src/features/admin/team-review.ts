import type { Team } from '../teams/models';
export const partitionReviewTeams = (teams: Team[]) => ({
  pending: teams.filter(team => team.status === 'pending'),
  approved: teams.filter(team => team.status === 'approved'),
  rejected: teams.filter(team => team.status === 'rejected'),
});
