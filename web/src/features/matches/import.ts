import { z } from 'zod';

const objectSchema = z.record(z.string(), z.unknown());
const candidatesSchema = z.array(z.unknown());
const numericSchema = z.number().nonnegative();
const idSchema = z.union([z.string(), z.number(), z.literal(Infinity), z.literal(-Infinity)]);
const stringSchema = z.string();
const importedPlayerSchema = z.object({ player_id: z.string(), username: z.string(), team: z.enum(['home', 'away']), stats: z.record(z.string(), z.number()) });
const identitySchema = z.object({ id: idSchema, username: z.string() });
type ImportedPlayer = z.infer<typeof importedPlayerSchema>;

function object(value: unknown): Record<string, unknown> {
  const parsed = objectSchema.safeParse(value);
  if (!parsed.success) throw new Error('Expected an object in the match export.');
  return parsed.data;
}

function numeric(value: unknown): number {
  const parsed = numericSchema.safeParse(value);
  return parsed.success ? parsed.data : 0;
}

function parseImportData(value: unknown) {
  const raw = object(value), stats = raw.stats ? object(raw.stats) : {};
  const matchId = raw.match_id || raw.id || raw.matchId;
  const parsedMatchId = idSchema.safeParse(matchId);
  if (!parsedMatchId.success) throw new TypeError('File has no match ID.');
  const nestedPlayers = candidatesSchema.safeParse(stats.players);
  const candidates = nestedPlayers.success ? nestedPlayers.data : raw.players;
  const parsedCandidates = candidatesSchema.safeParse(candidates);
  if (!parsedCandidates.success) throw new TypeError('File has no player stats.');

  const players: ImportedPlayer[] = [];
  for (const candidate of parsedCandidates.data) {
    const player = object(candidate);
    const team = importedPlayerSchema.shape.team.safeParse(player.team);
    if (!team.success) continue;
    const identity = identitySchema.safeParse({ id: player.player_id ?? player.playerId, username: player.username });
    if (!identity.success) throw new TypeError('Player identity is missing.');
    const playerStats = player.stats ? object(player.stats) : {};
    const playerValues: Record<string, number> = {};
    for (const [key, value] of Object.entries(playerStats)) playerValues[key] = numeric(value);
    players.push({ player_id: String(identity.data.id), username: identity.data.username, team: team.data, stats: playerValues });
  }
  if (players.length === 0) throw new Error('File has no player stats.');

  const score = raw.score || stats.score;
  const scoreValue = score ? object(score) : {};
  const stadium = stringSchema.safeParse(raw.stadium), nestedStadium = stringSchema.safeParse(stats.stadium);
  return {
    match_id: String(parsedMatchId.data),
    stadium: stadium.success ? stadium.data : (nestedStadium.success ? nestedStadium.data : ''),
    match_length: numeric(raw.match_length ?? stats.matchLength),
    score: { home: numeric(scoreValue.home), away: numeric(scoreValue.away) },
    players,
  };
}

const importedMatchSchema = z.unknown().transform(parseImportData);
export type ImportedMatch = z.infer<typeof importedMatchSchema>;

export function parseImport(text: string): ImportedMatch {
  return importedMatchSchema.parse(JSON.parse(text));
}
