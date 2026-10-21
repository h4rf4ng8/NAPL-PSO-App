import {test,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {EditTeamModal} from '../src/features/teams/team-forms';
import {loadTeamForEdit} from '../src/features/teams/api';
import {login,clearSession,tick,apiPath} from './auth-fixture';
Object.defineProperty(globalThis,'React',{configurable:true,value:React});
after(()=>{Reflect.deleteProperty(globalThis,'React');});afterEach(clearSession);
for(const logoUrl of ['/api/media/teams/team/logo?v=saved','https://images.example.test/original.png'])test('team editor preserves full saved exclusions and unchanged logo '+logoUrl,async()=>{
 const seasons=Array.from({length:35},(_,i)=>`CUSTOM${i}`);
 const source={id:'team',name:'Old Name',tag:'OLD',color:'#123456',description:'Complete saved description',ownerUsername:'Owner',members:['Owner'],invitations:[],pendingMembers:[],totw:false,totwSetAt:null,seasons,formation:'custom',lineup:{legacy:'Owner'},status:'approved',logoUrl,createdAt:1,reviewedAt:null,reviewedBy:null,rejectionReason:null};
 const fields=Object.entries(source).map(([key,value],index)=>({index,key,value}));let saved:Record<string,unknown>|undefined;const reads:string[]=[];
 await login(async(url,init)=>{
  const path=apiPath(url);reads.push(path);
  if(init?.method==='PATCH'){saved=JSON.parse(String(init.body));return Response.json({ok:true,id:'team'});}
  if(path.startsWith('/api/media/'))return Response.json({externalUrl:'https://images.example.test/render.png'});
  if(path==='/api/teams/team')return Response.json({editorUrl:'/api/teams/team/editor?revision=original'});
  assert.ok(path.startsWith('/api/teams/team/editor?revision=original'));
  const next=path.includes('after=');return Response.json({nodes:next?fields.slice(10):fields.slice(0,10),totalCount:fields.length,pageInfo:{endCursor:next?null:'next',hasNextPage:!next}});
 });
 const team=await loadTeamForEdit('team');assert.deepEqual(team.seasons,seasons);assert.equal(reads.filter(path=>path.includes('editor')).length,2);
 let view:ReactTestRenderer;let completed=false;
 await act(async()=>{view=create(React.createElement(EditTeamModal,{team,onClose:()=>{},onSaved:()=>{completed=true;}}));await tick();});
 await act(async()=>{view!.root.findAllByType('input').find(node=>node.props.value==='Old Name')!.props.onChange({target:{value:'New Name'}});});
 await act(async()=>{view!.root.findAllByType('button').find(node=>node.children.includes('SAVE CHANGES'))!.props.onClick();await tick();});
 assert.equal(completed,true);assert.equal(saved!.name,'New Name');assert.deepEqual(saved!.seasons,seasons);
 assert.equal(Object.hasOwn(saved!,'logoUrl'),false);assert.equal(Object.hasOwn(saved!,'lineup'),false);assert.equal(Object.hasOwn(saved!,'formation'),false);
 act(()=>view!.unmount());
});
