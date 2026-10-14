import { optional,request,segment } from '../../api/http';
import type { Article, News, Rule } from './models';
export const content={
 listNews:()=>request<News[]>('/api/news'),
 saveNews:(n:Partial<Pick<News,'id'|'type'|'title'|'body'|'pinned'|'homeTeamId'|'awayTeamId'|'homeScore'|'awayScore'|'date'|'notes'|'autoFromSubmission'>>)=>request<News>('/api/news','POST',{id:n.id,type:n.type,title:n.title,body:n.body,pinned:n.pinned,homeTeamId:n.homeTeamId,awayTeamId:n.awayTeamId,homeScore:n.homeScore,awayScore:n.awayScore,date:n.date,notes:n.notes,autoFromSubmission:n.autoFromSubmission}),
 deleteNews:(id:string)=>request<void>(`/api/news/${segment(id)}`,'DELETE'),
 listRulesSections:()=>request<Rule[]>('/api/rules'),
 saveRulesSection:(r:Pick<Rule,'id'|'title'|'body'|'sortOrder'>)=>request<Rule>('/api/rules','POST',{id:r.id,title:r.title,body:r.body,sortOrder:r.sortOrder}),
 deleteRulesSection:(id:string)=>request<void>(`/api/rules/${segment(id)}`,'DELETE'),
 reorderRulesSections:(ids:string[])=>request<void>('/api/rules/order','PUT',{ids}),
 listArticles:()=>request<Article[]>('/api/articles'),
 getArticleBySlug:(slug:string)=>optional<Article>(`/api/articles/slug/${segment(slug)}`),
 saveArticle:(a:Pick<Article,'slug'|'title'|'coverImageUrl'|'body'|'excerpt'> & Partial<Pick<Article,'id'|'publishedAt'>>)=>request<Article>('/api/articles','POST',{id:a.id||a.slug,slug:a.slug,title:a.title,coverImageUrl:a.coverImageUrl||null,body:a.body,excerpt:a.excerpt,publishedAt:a.publishedAt}),
 deleteArticle:(id:string)=>request<void>(`/api/articles/${segment(id)}`,'DELETE'),
};
