import { z } from 'zod';
import { graphqlEndpoints } from '@napl/contracts';

const readEndpoints = new Set<string>(Object.values(graphqlEndpoints));

export class ApiError extends Error {
  constructor(public status:number, public code:string, message:string) { super(message); }
}
const pending:{csrf?:Promise<string>;refresh?:Promise<void>}={};
const csrfResponseSchema = z.object({csrfToken:z.string()});
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
function cookieCsrf():string|undefined {
  for(const part of document.cookie.split(';')) {
    const [name,...value]=part.trim().split('=');
    if(name==='__Host-napl-csrf'||name==='napl-csrf') return decodeURIComponent(value.join('='));
  }
  return undefined;
}
async function csrfToken(force=false):Promise<string> {
  const cookie=force?undefined:cookieCsrf();
  if(cookie)return cookie;
  pending.csrf ??= (async()=>{
    try {
      const response=await fetch('/auth/csrf');
      const body:unknown=await response.json();
      const parsed=csrfResponseSchema.safeParse(body);
      if(!response.ok||!parsed.success)throw new Error('Could not initialize secure session.');
      return parsed.data.csrfToken;
    } finally { pending.csrf=undefined; }
  })();
  return pending.csrf;
}
export function resetCsrf():void { pending.csrf=undefined; }
export async function request<T>(path:string, method='GET', body?:unknown, signal?:AbortSignal):Promise<T> {
  if(!path.startsWith('/api/')&&!path.startsWith('/auth/'))throw new Error('Invalid API path');
  const payload=JSON.stringify(body);
  const graphql=readEndpoints.has(path);
  const mutates=!graphql&&!['GET','HEAD'].includes(method);
  const retry=path!=='/auth/refresh';
  const idempotencyKey=mutates?crypto.randomUUID():undefined;
  for(let attempt=0;attempt<2;attempt++) {
    signal?.throwIfAborted();
    const headers:Record<string,string>={'Accept':'application/json'};
    if(graphql)headers['Apollo-Require-Preflight']='true';
    if(mutates){headers['X-CSRF-Token']=await csrfToken();headers['Idempotency-Key']=idempotencyKey!;}
    if(body!==undefined)headers['Content-Type']='application/json';
    signal?.throwIfAborted();
    const response=await fetch(path,{method,headers,signal,credentials:'same-origin',...(body!==undefined&&{body:payload})});
    signal?.throwIfAborted();
    if(response.ok) {
      if(mutates && path.startsWith('/api/')) {
        const { resetQueries } = await import('./client');
        await resetQueries();
      }
      return response.status===204?undefined as T:response.json();
    }
    let problem:unknown;
    try {problem=await response.json();}catch{problem=null;}
    const parsedProblem=errorResponseSchema.safeParse(problem);
    const fields=parsedProblem.success?parsedProblem.data:undefined;
    const graphError=fields?.errors;
    signal?.throwIfAborted();
    let code='request_failed';
    if (typeof fields?.error==='string') code=fields.error;
    else if (typeof fields?.error==='object'&&typeof fields.error.code==='string') code=fields.error.code;
    else if (graphError?.extensions?.code!==undefined) code=graphError.extensions.code;
    if(retry&&attempt===0&&path.startsWith('/api/')&&['access_expired','session_expired','membership_refresh_required'].includes(code)) {
      pending.refresh ??= (async()=>{try{await request<void>('/auth/refresh','POST',{});}finally{pending.refresh=undefined;}})();
      await pending.refresh;
      continue;
    }
    // A second tab can rotate the CSRF cookie before this request arrives.
    if(retry&&attempt===0&&mutates&&code==='csrf_invalid'){await csrfToken(true);continue;}
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
