import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { session } from './session-fixture';
export { session } from './session-fixture';
import { supabase } from '../src/auth/client';
export const apiPath = (url: unknown) => String(url).replace('http://api.example.test','');
export const tick = () => new Promise<void>(resolve=>setImmediate(resolve));
export async function login(transport:(url:string,init?:RequestInit)=>Promise<Response>, value=session()) {
 mock.method(globalThis,'fetch',async(url,init)=>String(url).includes('grant_type=password')?Response.json(value):transport(String(url),init));
 const result=await supabase.auth.signInWithPassword({email:'test@example.test',password:'test'});assert.equal(result.error,null);return value;
}
export async function clearSession() {localStorage.clear();await supabase.auth.signOut({scope:'local'});mock.restoreAll();}
