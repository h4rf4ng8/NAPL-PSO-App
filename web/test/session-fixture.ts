import type { Session } from '@supabase/supabase-js';
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
export function session(userId='user-a', rotation=1, expiresAt=Math.floor(Date.now()/1000)+3600):Session {
 return {access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:userId,exp:expiresAt,session_id:`${userId}-session`})}.${encode(rotation)}`,refresh_token:`${userId}-refresh-${rotation}`,token_type:'bearer',expires_in:3600,expires_at:expiresAt,user:{id:userId,aud:'authenticated',role:'authenticated',app_metadata:{provider:'discord'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
}
