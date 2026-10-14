import { request,segment } from '../../api/http';
import type { Vote, VotingPeriod } from './models';
export const voting={
 listTotwPeriods:()=>request<VotingPeriod[]>('/api/voting/periods'),
 createTotwPeriod:({closesAt,eligiblePlayers}:Pick<VotingPeriod,'closesAt'|'eligiblePlayers'>)=>request<VotingPeriod>('/api/voting/periods','POST',{closesAt,eligiblePlayers}),
 updateTotwPeriod:(id:string,fields:Partial<VotingPeriod>)=>request<VotingPeriod>(`/api/voting/periods/${segment(id)}`,'PATCH',fields),
 deleteTotwPeriod:(id:string)=>request<void>(`/api/voting/periods/${segment(id)}`,'DELETE'),
 listTotwVotes:(id:string)=>request<Vote[]>(`/api/voting/periods/${segment(id)}/votes`),
 submitTotwVotes:(id:string,votes:{gk:string;def:string;cm:string;st:string})=>request<void>(`/api/voting/periods/${segment(id)}/votes`,'PUT',votes),
};
