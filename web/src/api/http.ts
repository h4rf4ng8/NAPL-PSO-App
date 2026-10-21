import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { graphqlEndpoints } from '@napl/contracts';
import { apiOrigin, sessionUserId, sessionVersion, supabase } from '../auth/client';

const readEndpoints = new Set<string>(Object.values(graphqlEndpoints));

export class ApiError extends Error {
  constructor(public status:number, public code:string, message:string) { super(message); }
}
/* eslint-disable unicorn/prefer-await -- Zod catch supplies validation defaults, not Promise handlers. */
const optionalString = z.string().optional().catch(undefined);
const errorObjectSchema = z.object({code:optionalString,message:optionalString});
const graphErrorSchema = z.object({
  message:optionalString,
  extensions:z.object({code:optionalString}).optional().catch(undefined),
});
// An array occupied the first object slot in the legacy decoder, but has no error fields.
const graphErrorsSchema = z.array(z.union([
  graphErrorSchema,
  z.array(z.unknown()).transform(() => ({message:undefined,extensions:undefined})),
]).optional().catch(undefined)).catch([]).transform(errors => errors.find(error => error !== undefined));
const errorResponseSchema = z.object({
  message:optionalString,
  error:z.union([z.string(),errorObjectSchema]).optional().catch(undefined),
  errors:graphErrorsSchema,
});
/* eslint-enable unicorn/prefer-await */
export async function request<T>(path:string, method='GET', body?:unknown, signal?:AbortSignal):Promise<T> {
  if(!path.startsWith('/api/'))throw new Error('Invalid API path');
  const payload=JSON.stringify(body);
  const graphql=readEndpoints.has(path);
  const mutates=!graphql&&!['GET','HEAD'].includes(method);
  const version = sessionVersion();
  const userId = sessionUserId();
  const check = () => {
    signal?.throwIfAborted();
    if(version!==sessionVersion())throw new ApiError(401,'login_required','Please sign in again.');
  };
  check();
  const { data: { session }, error } = await supabase.auth.getSession();
  check();
  if (error) throw error;
  // Storage can change in another tab before its SDK event reaches this tab.
  if((session?.user.id??null)!==userId)throw new ApiError(401,'login_required','Please sign in again.');
  let token = session?.access_token;
  const idempotencyKey=mutates?crypto.randomUUID():undefined;
  for(let attempt=0;attempt<2;attempt++) {
    check();
    const headers:Record<string,string>={'Accept':'application/json'};
    if(graphql)headers['Apollo-Require-Preflight']='true';
    if(token)headers.Authorization=`Bearer ${token}`;
    if(mutates)headers['Idempotency-Key']=idempotencyKey!;
    if(body!==undefined)headers['Content-Type']='application/json';
    check();
    const response=await fetch(`${apiOrigin}${path}`,{method,headers,signal,credentials:'omit',...(body!==undefined&&{body:payload})});
    check();
    if(response.ok) {
      const result=response.status===204?undefined as T:(path.startsWith('/api/media/') && !response.headers.get('Content-Type')?.includes('application/json')?await response.blob() as T:await response.json() as T);
      check();
      if(mutates && path.startsWith('/api/')) {
        const { resetQueries } = await import('./client');
        check();
        await resetQueries();
      }
      check();
      return result;
    }
    let problem:unknown;
    try {problem=await response.json();}catch{problem=null;}
    const parsedProblem=errorResponseSchema.safeParse(problem);
    const fields=parsedProblem.success?parsedProblem.data:undefined;
    const graphError=fields?.errors;
    check();
    let code='request_failed';
    if (typeof fields?.error==='string') code=fields.error;
    else if (typeof fields?.error==='object'&&typeof fields.error.code==='string') code=fields.error.code;
    else if (graphError?.extensions?.code!==undefined) code=graphError.extensions.code;
    if(session&&attempt===0&&code==='access_expired'&&response.status===401) {
      const { data: { session: latest }, error: sessionError } = await supabase.auth.getSession();
      check();
      if (sessionError) throw sessionError;
      if (latest?.user.id !== session.user.id) throw new ApiError(401,'login_required','Please sign in again.');
      let replacement:Session|null = latest;
      if (latest.access_token === token) {
        const renewed = await supabase.auth.refreshSession();
        check();
        if (renewed.error) throw renewed.error;
        replacement = renewed.data.session;
      }
      if (replacement?.user.id !== session.user.id) throw new ApiError(401,'login_required','Please sign in again.');
      token = replacement.access_token;
      continue;
    }
    const message=fields?.message??(typeof fields?.error==='object'?fields.error.message:undefined)
      ??graphError?.message??`Request failed (${response.status})`;
    throw new ApiError(response.status,code,message);
  }
  throw new Error('Request retry exhausted.');
}
export async function optional<T>(path:string):Promise<T|null> {
 try{return await request<T>(path);}catch(error){if(error instanceof ApiError&&error.status===404)return null;throw error;}
}
export const segment=(value:string):string=>encodeURIComponent(value);
