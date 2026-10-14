export interface ImportedPlayer {player_id:string;username:string;team:string;stats:Record<string,number>;}
export interface ImportedMatch {match_id:string;stadium:string;match_length:number;score:{home:number;away:number};players:ImportedPlayer[];}
function object(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Expected an object in the match export.');
 return value as Record<string,unknown>;
}
function numeric(value:unknown):number {return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;}
export function parseImport(text:string):ImportedMatch {
 const raw=object(JSON.parse(text)),stats=raw.stats?object(raw.stats):{};
 const matchId=raw.match_id||raw.id||raw.matchId;
 if(typeof matchId!=='string'&&typeof matchId!=='number') throw new TypeError('File has no match ID.');
 const candidates=Array.isArray(stats.players)?stats.players:raw.players;
 if(!Array.isArray(candidates)) throw new TypeError('File has no player stats.');
 const players:ImportedPlayer[]=[];
 for(const candidate of candidates) {
  const p=object(candidate);
  if(p.team!=='home'&&p.team!=='away')continue;
  const id=p.player_id??p.playerId;
  if((typeof id!=='string'&&typeof id!=='number')||typeof p.username!=='string') throw new TypeError('Player identity is missing.');
  const values:Record<string,number>={};
  const stats=Object.entries(p.stats?object(p.stats):{});
  for(const [key,value] of stats) values[key]=numeric(value);
  players.push({player_id:String(id),username:p.username,team:p.team,stats:values});
 }
 if(players.length === 0)throw new Error('File has no player stats.');
 const score=raw.score||stats.score;
 const scoreValue=score?object(score):{};
 return {match_id:String(matchId),stadium:typeof raw.stadium==='string'?raw.stadium:(typeof stats.stadium==='string'?stats.stadium:''),match_length:numeric(raw.match_length??stats.matchLength),score:{home:numeric(scoreValue.home),away:numeric(scoreValue.away)},players};
}
