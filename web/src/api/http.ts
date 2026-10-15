export class ApiError extends Error {
  constructor(public status:number, public code:string, message:string) { super(message); }
}
const pending:{csrf?:Promise<string>;refresh?:Promise<void>}={};
const asObject = (value:unknown):value is Record<string,unknown> => !!value && typeof value === 'object';
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
      if(!response.ok||!asObject(body)||typeof body.csrfToken!=='string')throw new Error('Could not initialize secure session.');
      return body.csrfToken;
    } finally { pending.csrf=undefined; }
  })();
  return pending.csrf;
}
export function resetCsrf():void { pending.csrf=undefined; }
export async function request<T>(path:string, method='GET', body?:unknown, retry=true, commandId?:string, signal?:AbortSignal):Promise<T> {
  if(!path.startsWith('/api/')&&!path.startsWith('/auth/'))throw new Error('Invalid API path');
  const mutates=!['GET','HEAD'].includes(method);
  const idempotencyKey=mutates?commandId??crypto.randomUUID():undefined;
  for(let attempt=0;attempt<2;attempt++) {
    signal?.throwIfAborted();
    const headers:Record<string,string>={'Accept':'application/json'};
    if(mutates){headers['X-CSRF-Token']=await csrfToken();headers['Idempotency-Key']=idempotencyKey!;}
    if(body!==undefined)headers['Content-Type']='application/json';
    signal?.throwIfAborted();
    const response=await fetch(path,{method,headers,signal,credentials:'same-origin',...(body!==undefined&&{body:JSON.stringify(body)})});
    if(response.ok) {
      if(mutates && path !== '/api/graphql' && path.startsWith('/api/')) {
        // Reuse session reset: cancel pre-command reads so they cannot refill stale data.
        const { resetClient } = await import('./client');
        resetClient();
      }
      return response.status===204?undefined as T:response.json();
    }
    let problem:unknown;
    try {problem=await response.json();}catch{problem=null;}
    const error=asObject(problem)?problem.error:undefined;
    const graphErrors=asObject(problem)&&Array.isArray(problem.errors)?problem.errors:[];
    const graphError=graphErrors.find(asObject);
    const graphExtensions=graphError&&asObject(graphError.extensions)?graphError.extensions:undefined;
    signal?.throwIfAborted();
    let code='request_failed';
    if (typeof error==='string') code=error;
    else if (asObject(error)&&typeof error.code==='string') code=error.code;
    else if (graphExtensions&&typeof graphExtensions.code==='string') code=graphExtensions.code;
    if(retry&&attempt===0&&path.startsWith('/api/')&&['access_expired','session_expired','membership_refresh_required'].includes(code)) {
      pending.refresh ??= (async()=>{try{await request<void>('/auth/refresh','POST',{},false);}finally{pending.refresh=undefined;}})();
      await pending.refresh;
      continue;
    }
    // A second tab can rotate the CSRF cookie before this request arrives.
    if(retry&&attempt===0&&mutates&&code==='csrf_invalid'){await csrfToken(true);continue;}
    const graphMessage=graphError&&typeof graphError.message==='string'?graphError.message:undefined;
    const message=asObject(problem)&&typeof problem.message==='string'?problem.message:(asObject(error)&&typeof error.message==='string'?error.message:(graphMessage??`Request failed (${response.status})`));
    throw new ApiError(response.status,code,message);
  }
  throw new Error('Request retry exhausted.');
}
export async function optional<T>(path:string):Promise<T|null> {
 try{return await request<T>(path);}catch(error){if(error instanceof ApiError&&error.status===404)return null;throw error;}
}
export const segment=(value:string):string=>encodeURIComponent(value);
