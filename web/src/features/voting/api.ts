import { request,segment } from '../../api/http';
import type { VotingPeriodFieldsFragment } from '../../api/generated/graphql';
import type { Vote, VotingPeriod } from './models';
export const voting={
 listTotwPeriods:()=>request<VotingPeriod[]>('/api/voting/periods'),
 createTotwPeriod:({closesAt,eligiblePlayers}:Pick<VotingPeriod,'closesAt'|'eligiblePlayers'>)=>request<VotingPeriod>('/api/voting/periods','POST',{closesAt,eligiblePlayers}),
 updateTotwPeriod:(id:string,fields:Partial<VotingPeriod>)=>request<VotingPeriod>(`/api/voting/periods/${segment(id)}`,'PATCH',fields),
 deleteTotwPeriod:(id:string)=>request<void>(`/api/voting/periods/${segment(id)}`,'DELETE'),
 listTotwVotes:(id:string)=>request<Vote[]>(`/api/voting/periods/${segment(id)}/votes`),
 submitTotwVotes:(id:string,votes:{gk:string;def:string;cm:string;st:string})=>request<void>(`/api/voting/periods/${segment(id)}/votes`,'PUT',votes),
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';

export function mapVotingPeriod(row: VotingPeriodFieldsFragment): VotingPeriod {
  if (row.winners !== null && (!isRecord(row.winners) || Object.values(row.winners).some(value => !isString(value)))) {
    throw new Error('Invalid GraphQL voting winners data.');
  }
  return { ...row, winners: row.winners as Record<string, string> | null };
}
