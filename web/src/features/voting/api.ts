import { request,segment } from '../../api/http';
import type { Vote, VotingPeriod } from './models';
export const voting={
 myTotwVotes:(id:string)=>request<Vote[]>(`/api/voting/periods/${segment(id)}/votes/me`),
 createTotwPeriod:({closesAt,eligiblePlayers}:Pick<VotingPeriod,'closesAt'|'eligiblePlayers'>)=>request<void>('/api/voting/periods','POST',{closesAt,eligiblePlayers}),
 updateTotwPeriod:(id:string,fields:Partial<VotingPeriod>)=>request<void>(`/api/voting/periods/${segment(id)}`,'PATCH',fields),
 deleteTotwPeriod:(id:string)=>request<void>(`/api/voting/periods/${segment(id)}`,'DELETE'),
 submitTotwVotes:(id:string,votes:{gk:string;def:string;cm:string;st:string})=>request<void>(`/api/voting/periods/${segment(id)}/votes/me`,'PUT',votes),
};
