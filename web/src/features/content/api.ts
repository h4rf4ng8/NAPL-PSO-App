import { optional,request,segment } from '../../api/http';
import type { Article, News, Rule } from './models';
export const content={
 moveRulesSection:(id:string,direction:'up'|'down')=>request<void>(`/api/rules/${segment(id)}/move`,'POST',{direction}),
 saveNews:(n:Partial<Pick<News,'id'|'type'|'title'|'body'|'pinned'|'homeTeamId'|'awayTeamId'|'homeScore'|'awayScore'|'date'|'notes'|'autoFromSubmission'>>)=>request<void>('/api/news','POST',{id:n.id,type:n.type,title:n.title,body:n.body,pinned:n.pinned,homeTeamId:n.homeTeamId,awayTeamId:n.awayTeamId,homeScore:n.homeScore,awayScore:n.awayScore,date:n.date,notes:n.notes,autoFromSubmission:n.autoFromSubmission}),
 deleteNews:(id:string)=>request<void>(`/api/news/${segment(id)}`,'DELETE'),
 saveRulesSection:(r:Pick<Rule,'id'|'title'|'body'|'sortOrder'>)=>request<void>('/api/rules','POST',{id:r.id,title:r.title,body:r.body,sortOrder:r.sortOrder}),
 deleteRulesSection:(id:string)=>request<void>(`/api/rules/${segment(id)}`,'DELETE'),
 getArticleBySlug:(slug:string)=>optional<Article>(`/api/articles/slug/${segment(slug)}`),
 saveArticle:(a:Pick<Article,'slug'|'title'|'body'|'excerpt'> & Partial<Pick<Article,'id'|'publishedAt'|'coverImageUrl'>>)=>request<void>('/api/articles','POST',{id:a.id||a.slug,slug:a.slug,title:a.title,coverImageUrl:a.coverImageUrl===undefined?undefined:a.coverImageUrl||null,body:a.body,excerpt:a.excerpt,publishedAt:a.publishedAt}),
 deleteArticle:(id:string)=>request<void>(`/api/articles/${segment(id)}`,'DELETE'),
};
