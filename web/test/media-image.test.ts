import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MediaImage, mediaUrl } from '../src/components/MediaImage';
import { clearSession, login, tick, session } from './auth-fixture';
afterEach(clearSession);
test('public media uses the API origin and external URLs stay intact',()=>{
 assert.equal(mediaUrl('/api/media/accounts/a/image'),'http://api.example.test/api/media/accounts/a/image');
 assert.equal(mediaUrl('https://cdn.example/image.png'),'https://cdn.example/image.png');
});
test('private pending images use bearer transport and revoke object URLs on replacement and unmount',async()=>{
 const revoked:string[]=[];let created=0;const paths:string[]=[];
 await login(async(url,init)=>{paths.push(url);assert.match(new Headers(init?.headers).get('Authorization')??'',/^Bearer /);return new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/png'}});});
 mock.method(URL,'createObjectURL',()=>`blob:private-${++created}`);
 mock.method(URL,'revokeObjectURL',(url:string)=>{revoked.push(url);});
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(MediaImage,{src:'/api/media/accounts/a/pending-image?v=1',alt:'pending'}));await tick();});
 assert.equal(view!.root.findByType('img').props.src,'blob:private-1');
 await act(async()=>{view!.update(React.createElement(MediaImage,{src:'/api/media/accounts/a/pending-image?v=2',alt:'pending'}));await tick();});
 assert.equal(view!.root.findByType('img').props.src,'blob:private-2');assert.deepEqual(revoked,['blob:private-1']);
 act(()=>view!.unmount());assert.deepEqual(revoked,['blob:private-1','blob:private-2']);assert.equal(paths.length,2);
});
test('external protected image descriptors avoid fetching an external host with credentials',async()=>{
 const paths:string[]=[];await login(async(url)=>{paths.push(url);return Response.json({externalUrl:'https://cdn.example/private.png'});});
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(MediaImage,{src:'/api/media/teams/a/logo',alt:'logo'}));await tick();});
 assert.equal(view!.root.findByType('img').props.src,'https://cdn.example/private.png');
 assert.deepEqual(paths,['http://api.example.test/api/media/teams/a/logo?descriptor=1']);act(()=>view!.unmount());
});
test('a mounted private image clears and reloads at an identity boundary',async()=>{
 const revoked:string[]=[];let created=0;const authorizations:string[]=[];
 const transport=async(_url:string,init?:RequestInit)=>{authorizations.push(new Headers(init?.headers).get('Authorization')??'');return new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/png'}});};
 await login(transport);mock.method(URL,'createObjectURL',()=>`blob:identity-${++created}`);mock.method(URL,'revokeObjectURL',(url:string)=>{revoked.push(url);});
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(MediaImage,{src:'/api/media/accounts/a/pending-image?v=1',alt:'pending'}));await tick();});
 assert.equal(view!.root.findByType('img').props.src,'blob:identity-1');
 await act(async()=>{await login(transport,session('user-b'));await tick();});
 assert.equal(view!.root.findByType('img').props.src,'blob:identity-2');assert.deepEqual(revoked,['blob:identity-1']);assert.equal(authorizations.length,2);assert.notEqual(authorizations[0],authorizations[1]);
 act(()=>view!.unmount());
});
