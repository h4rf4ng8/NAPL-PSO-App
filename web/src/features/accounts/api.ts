import { optional,request,segment } from '../../api/http';
import { AWARD_IDS } from '@napl/contracts/accounts';
import type { Account, PositionRequest } from './models';
type AwardId = (typeof AWARD_IDS)[number];
export const accounts={
 getAccount:(username:string)=>optional<Account>(`/api/accounts/${segment(username)}`),
 getAccountById:(id:string)=>optional<Account>(`/api/accounts/id/${segment(id)}`),
 listAccounts:()=>request<Account[]>('/api/accounts'),
 patchAccount:(id:string,fields:Partial<Omit<Account,'awards'>>)=>request<Account>(`/api/accounts/${segment(id)}`,'PATCH',fields),
 assignAward:(id:string,awardId:AwardId,season:string)=>request<void>(`/api/accounts/${segment(id)}/awards/${segment(awardId)}/${segment(season)}`,'PUT'),
 removeAward:(id:string,awardId:string,season:string)=>request<void>(`/api/accounts/${segment(id)}/awards/${segment(awardId)}/${segment(season)}`,'DELETE'),
 renameAccount:(id:string,username:string)=>request<void>(`/api/accounts/${segment(id)}/rename`,'POST',{username}),
 listPositionRequests:(status:string|null=null)=>request<PositionRequest[]>(`/api/position-requests${status?`?status=${segment(status)}`:''}`),
 createPositionRequest:({toPos,reason=''}:{toPos:string;reason?:string})=>request<PositionRequest>('/api/position-requests','POST',{toPos,reason}),
 approvePositionRequest:(id:string,reviewNote='')=>request<PositionRequest>(`/api/position-requests/${segment(id)}/review`,'POST',{status:'approved',reviewNote}),
 denyPositionRequest:(id:string,reviewNote='')=>request<PositionRequest>(`/api/position-requests/${segment(id)}/review`,'POST',{status:'denied',reviewNote}),
 deletePositionRequest:(id:string)=>request<void>(`/api/position-requests/${segment(id)}`,'DELETE'),
};
