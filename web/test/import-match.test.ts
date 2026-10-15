import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseImport} from '../src/features/matches/import';
test('normalizes old and nested exports, dropping spectators and nonnumeric stats',()=>{
 const players=[{player_id:12,username:'Alex',team:'home',stats:{goals:2,passes:20,bad:'NaN'}},{player_id:13,username:'Visitor',team:'none'}];
 const old=parseImport(JSON.stringify({match_id:'match',players,score:{home:2,away:0}}));
 const nested=parseImport(JSON.stringify({id:'match',stats:{players,score:{home:2,away:0}}}));
 assert.deepEqual(old,nested);assert.equal(old.players.length,1);assert.equal(old.players[0]!.player_id,'12');assert.equal(old.players[0]!.stats.bad,0);
});
test('rejects missing identity or player data',()=>{
 assert.throws(()=>parseImport('{}'),/match ID/);
 assert.throws(()=>parseImport('{"id":"m","players":[]}'),/player stats/);
});
