import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseImport} from '../src/features/matches/import';
test('normalizes old and nested exports, dropping spectators and nonnumeric stats',()=>{
 const players='[{"player_id":12,"username":"Alex","team":"home","stats":{"goals":2,"passes":20,"bad":"NaN","negative":-1,"overflow":1e400}},{"team":"none"}]';
 const old=parseImport(`{"match_id":"match","players":${players},"score":{"home":2,"away":0}}`);
 const nested=parseImport(`{"id":"match","stats":{"players":${players},"score":{"home":2,"away":0}}}`);
 assert.deepEqual(old,nested);assert.equal(old.players.length,1);assert.equal(old.players[0]!.player_id,'12');
 assert.equal(old.players[0]!.stats.bad,0);assert.equal(old.players[0]!.stats.negative,0);assert.equal(old.players[0]!.stats.overflow,0);
});
test('rejects missing identity or player data',()=>{
 assert.throws(()=>parseImport('{}'),/File has no match ID/);
 assert.throws(()=>parseImport('{"id":"m","players":[]}'),/File has no player stats/);
 assert.throws(()=>parseImport('{"id":"m","players":[{"team":"home","username":"Alex"}]}'),/Player identity is missing/);
 assert.throws(()=>parseImport('{"id":"m","players":[null]}'),/Expected an object in the match export/);
 assert.throws(()=>parseImport('{"id":"m","players":[[]]}'),/Expected an object in the match export/);
});
test('keeps raw and nested aliases in their historical precedence',()=>{
 const parsed=parseImport(JSON.stringify({match_id:'primary',id:'legacy',matchId:'camel',stadium:'raw',match_length:20,
  players:[{player_id:'raw',username:'Raw',team:'home'}],score:{home:2,away:0},
  stats:{stadium:'nested',matchLength:30,players:[{playerId:'nested',username:'Nested',team:'away'}],score:{home:4,away:1}}}));
 assert.equal(parsed.match_id,'primary');assert.equal(parsed.stadium,'raw');assert.equal(parsed.match_length,20);
 assert.deepEqual(parsed.score,{home:2,away:0});assert.equal(parsed.players[0]?.player_id,'nested');
});
test('preserves numeric overflow IDs accepted by JSON.parse',()=>{
 const parsed=parseImport('{"id":1e400,"players":[{"playerId":1e400,"username":"Alex","team":"home"}]}');
 assert.equal(parsed.match_id,'Infinity');assert.equal(parsed.players[0]?.player_id,'Infinity');
});
