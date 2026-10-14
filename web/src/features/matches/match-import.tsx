import React, { useMemo, useRef, useState } from 'react';
import { matches as matchApi } from './api';
import { parseImport, type ImportedMatch } from './import';
import type { ImportResult } from './models';
import type { Account } from '../accounts/models';
import type { Team } from '../teams/models';
import { C } from '../../theme/theme';

// ============ IMPORT MATCH MANAGER ============
// Admin uploads a Strikers Club JSON match export. The app parses it, previews
// each player with a dropdown to confirm the ASL account, and on confirm adds
// the match to each mapped player's record.
//
// Auto-matching: if an ASL account has `strikersId` set, players in the file
// with matching player_id are auto-mapped. Otherwise admin picks manually.
// After a manual pick, that Strikers Player ID gets saved onto the ASL account
// so future imports match automatically ("teach once, applies forever").
//
// Dedup: match_id from the file is stored on each match record. Uploading the
// same file twice is a no-op (players who already have that match_id are skipped).
//
// Unmatched players (no ASL account exists yet): logged but skipped. If the
// player later signs up, admin can retroactively add these stats from the
// Skipped Log tab.
export const ImportMatchManager = ({ account: _account, allPlayers, allTeams, currentSeason, onRefresh }: { account: Account; allPlayers: Account[]; allTeams: Team[]; currentSeason: string; onRefresh: () => void }) => {
  const [step, setStep] = useState(1); // 1=upload, 2=teams, 3=map, 4=confirm
  const [matchData, setMatchData] = useState<ImportedMatch | null>(null); // parsed JSON
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  // For each strikers player_id → ASL username picked (or '' for skip)
  const [playerMap, setPlayerMap] = useState<Record<string,string>>({});
  // Manual tackle override — admin can type the correct value from the game
  // website since the JSON often undercounts poke_tackles_won. Key = player_id,
  // value = number string (or '' for "use auto-computed from JSON").
  const [tackleOverrides, setTackleOverrides] = useState<Record<string,string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null); // shown on success screen
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Approved teams only
  const approvedTeams = useMemo(
    () => (allTeams || []).filter(t => t.status === 'approved'),
    [allTeams]
  );

  // Build lookup: strikersId → ASL account
  const aslByStrikersId = useMemo(() => {
    const map: Record<string,Account> = {};
    (allPlayers || []).forEach(p => {
      if (p.strikersId) map[String(p.strikersId)] = p;
    });
    return map;
  }, [allPlayers]);

  // ---------- STEP 1: parse uploaded file ----------
  // Accepts BOTH the legacy flat Strikers Club export format and the newer
  // nested one (where per-player stats live under `stats.players` with the
  // top-level `players` holding only join/team/result info). Normalizes
  // whichever shape it sees into the flat shape the rest of the flow
  // expects so steps 2-4 don't need to change.
  const handleFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    setBusy(true);
    try {
      let text;
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // Detect UTF-16 (Strikers Club exports are often UTF-16 LE with BOM)
      if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        text = new TextDecoder('utf-16le').decode(bytes.slice(2));
      } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        text = new TextDecoder('utf-16be').decode(bytes.slice(2));
      } else if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        text = new TextDecoder('utf-8').decode(bytes.slice(3));
      } else {
        text = new TextDecoder('utf-8').decode(bytes);
      }
      const data = parseImport(text);
      setMatchData(data);
      // Pre-fill player map: auto-match by strikersId when possible
      const initialMap:Record<string,string> = {};
      for (const p of data.players) {
        const asl = aslByStrikersId[String(p.player_id)];
        initialMap[p.player_id] = asl ? asl.username : '';
      }
      setPlayerMap(initialMap);
      setStep(2);
    } catch (error_) {
      setError('Could not parse file: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  // ---------- STEP 4: commit the import ----------
  const commit = async () => {
    setError('');
    if (!matchData) return;
    if (!homeTeamId || !awayTeamId) { setError('Pick both home and away teams first.'); return; }
    if (homeTeamId === awayTeamId) { setError('Home and away must be different teams.'); return; }
    setBusy(true);
    try {
      const result=await matchApi.importMatch({matchData,playerMap,tackleOverrides,homeTeamId,awayTeamId,season:currentSeason});
      setImportResult(result);
      setStep(5); // success screen
      if (onRefresh) onRefresh();
    } catch (error_) {
      setError('Import failed: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  // Reset for another import
  const startOver = () => {
    setStep(1);
    setMatchData(null);
    setHomeTeamId('');
    setAwayTeamId('');
    setPlayerMap({});
    setImportResult(null);
    setError('');
  };

  // ---------- RENDER HELPERS ----------
  const StepBadge = ({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) => (
    <div className="flex-1 text-center px-2 py-1.5 rounded flex items-center justify-center gap-1.5" style={{
      background: active ? `${C.goldLight}22` : (done ? `${C.green}22` : 'transparent'),
      border: `1px solid ${active ? C.goldLight : (done ? C.green : C.navyLight)}44`,
    }}>
      <span className="font-mono text-[10px] tracking-wider" style={{
        color: active ? C.goldLight : (done ? C.greenLight : `${C.cream}55`),
      }}>
        {done ? '✓' : n}. {label}
      </span>
    </div>
  );

  const H = ({ children }: { children: React.ReactNode }) => (
    <div className="font-heading tracking-wider text-xs mb-2" style={{ color: C.goldLight, letterSpacing: '0.2em' }}>{children}</div>
  );

  return (
    <div className="space-y-4">
      {/* Header + step tracker */}
      <div className="flex items-center gap-2 flex-wrap">
        <StepBadge n={1} label="UPLOAD"  active={step === 1} done={step > 1} />
        <StepBadge n={2} label="TEAMS"   active={step === 2} done={step > 2} />
        <StepBadge n={3} label="MAP"     active={step === 3} done={step > 3} />
        <StepBadge n={4} label="CONFIRM" active={step === 4} done={step > 4} />
      </div>

      {error && (
        <div className="p-3 rounded font-mono text-xs" style={{ background: `${C.red}22`, color: C.redLight, border: `1px solid ${C.red}44` }}>
          {error}
        </div>
      )}

      {/* ---------- STEP 1: UPLOAD ---------- */}
      {step === 1 && (
        <div className="p-6 rounded-lg text-center" style={{
          background: `${C.goldLight}08`,
          border: `2px dashed ${C.goldLight}55`,
        }}>
          <div className="text-4xl mb-3" style={{ color: C.goldLight }}>⬆</div>
          <div className="font-heading tracking-wider text-lg mb-1" style={{ color: C.goldLight }}>UPLOAD STRIKERS CLUB MATCH FILE</div>
          <div className="font-mono text-xs mb-4" style={{ color: `${C.cream}77` }}>
            .JSON export from Strikers Club (UTF-16 or UTF-8)
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
          <button
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 rounded font-heading tracking-wider text-sm"
            style={{
              background: C.goldLight, color: C.navyDeep,
              border: `1px solid ${C.gold}`,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >{busy ? 'PARSING…' : 'CHOOSE FILE'}</button>
        </div>
      )}

      {/* ---------- STEP 2: MATCH INFO + TEAMS ---------- */}
      {step === 2 && matchData && (
        <>
          <div className="p-4 rounded" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
            <H>MATCH INFO FROM FILE</H>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>MATCH ID</div>
                <div className="font-mono text-[10px] break-all" style={{ color: C.cream }}>{matchData.match_id.slice(0, 12)}…</div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>STADIUM</div>
                <div className="font-heading text-sm tracking-wider" style={{ color: C.cream }}>{matchData.stadium || '—'}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>LENGTH</div>
                <div className="font-heading text-sm tracking-wider" style={{ color: C.cream }}>{Math.floor((matchData.match_length || 0) / 60)}:00</div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>SCORE</div>
                <div className="font-heading text-lg tracking-wider" style={{ color: C.goldLight }}>
                  {matchData.score?.home ?? 0} - {matchData.score?.away ?? 0}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded" style={{ background: `${C.brandNavy}15`, border: `1px solid ${C.brandNavy}44` }}>
            <H>ASSIGN ASL TEAMS</H>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="font-mono text-[9px] tracking-wider mb-1" style={{ color: `${C.cream}77` }}>HOME (SCORE {matchData.score?.home ?? 0})</div>
                <select
                  value={homeTeamId}
                  onChange={(e) => setHomeTeamId(e.target.value)}
                  className="w-full px-3 py-2 rounded font-heading text-sm"
                  style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66` }}
                >
                  <option value="">— pick team —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>)}
                </select>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-wider mb-1" style={{ color: `${C.cream}77` }}>AWAY (SCORE {matchData.score?.away ?? 0})</div>
                <select
                  value={awayTeamId}
                  onChange={(e) => setAwayTeamId(e.target.value)}
                  className="w-full px-3 py-2 rounded font-heading text-sm"
                  style={{ background: C.navyDeep, color: C.cream, border: `1px solid ${C.navyLight}66` }}
                >
                  <option value="">— pick team —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.tag})</option>)}
                </select>
              </div>
            </div>
            {approvedTeams.length < 2 && (
              <div className="mt-2 font-mono text-[10px]" style={{ color: C.redLight }}>
                You need at least 2 approved teams to import a match.
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={startOver} className="px-4 py-2 rounded font-heading text-xs tracking-wider" style={{ background: `${C.navyLight}33`, color: `${C.cream}88` }}>← BACK</button>
            <button
              onClick={() => setStep(3)}
              disabled={!homeTeamId || !awayTeamId}
              className="flex-1 px-4 py-2 rounded font-heading text-xs tracking-wider"
              style={{
                background: (homeTeamId && awayTeamId) ? C.goldLight : `${C.navyLight}22`,
                color: (homeTeamId && awayTeamId) ? C.navyDeep : `${C.cream}44`,
                cursor: (homeTeamId && awayTeamId) ? 'pointer' : 'not-allowed',
              }}
            >NEXT: MAP PLAYERS →</button>
          </div>
        </>
      )}

      {/* ---------- STEP 3: MAP PLAYERS ---------- */}
      {step === 3 && matchData && (
        <>
          <div className="p-4 rounded" style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}44` }}>
            <H>MAP STRIKERS CLUB PLAYERS → ASL ACCOUNTS</H>
            <div className="font-mono text-[10px] mb-3" style={{ color: `${C.cream}77` }}>
              Auto-matched by Strikers Player ID when linked. Manually pick for anyone unmatched. Players with no ASL account will be skipped.
            </div>

            {/* Reminder for the tackle override system */}
            <div className="font-mono text-[10px] mb-3 p-2 rounded" style={{
              color: C.goldLight, background: `${C.gold}11`, border: `1px solid ${C.gold}44`,
            }}>
              ◆ TACKLE OVERRIDE — JSON only reports some poke tackles won. Check the game website
              and type the real number in the TKL field below if it's wrong. Leave blank to use the
              auto-computed value (poke_won + slide_won from JSON).
            </div>

            <div className="space-y-2">
              {matchData.players.map(p => {
                const teamBadge = p.team === 'home' ? 'HOME' : 'AWAY';
                const teamBadgeColor = p.team === 'home' ? C.brandNavy : C.red;
                const currentPick = playerMap[p.player_id] || '';
                const autoMatched = aslByStrikersId[String(p.player_id)];
                const isAuto = autoMatched && currentPick === autoMatched.username;
                const s = p.stats || {};
                const autoTkl = (s.poke_tackles_won || 0) + (s.slide_tackles_won || 0);
                const overrideVal = tackleOverrides[p.player_id];
                const effectiveTkl = (overrideVal === undefined || overrideVal === '')
                  ? autoTkl
                  : (Number(overrideVal) || 0);
                const summary = [
                  s.goals ? `${s.goals}G` : null,
                  s.assists ? `${s.assists}A` : null,
                  s.passes ? `${s.passes}p` : null,
                  effectiveTkl > 0 ? `${effectiveTkl}T` : null,
                  s.deflects ? `${s.deflects}D` : null,
                  s.catches ? `${s.catches}C` : null,
                ].filter(Boolean).join(' · ') || 'no stats';

                return (
                  <div key={p.player_id} className="p-2 rounded flex items-center gap-2 flex-wrap sm:flex-nowrap" style={{
                    background: currentPick ? `${C.green}11` : `${C.red}11`,
                    border: `1px solid ${currentPick ? C.green : C.red}33`,
                  }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-sm tracking-wider truncate" style={{ color: C.cream }}>{p.username}</div>
                      <div className="font-mono text-[9px] tracking-wider" style={{ color: `${C.cream}55` }}>ID: {p.player_id}</div>
                    </div>
                    <div className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded" style={{
                      background: `${teamBadgeColor}33`, color: teamBadgeColor === C.red ? C.redLight : `${C.brandNavy}`,
                    }}>{teamBadge}</div>
                    <div className="font-mono text-[9px] hidden sm:block" style={{ color: `${C.cream}66` }}>{summary}</div>
                    <select
                      value={currentPick}
                      onChange={(e) => setPlayerMap(m => ({ ...m, [p.player_id]: e.target.value }))}
                      className="px-2 py-1.5 rounded font-heading text-xs w-full sm:w-44"
                      style={{
                        background: C.navyDeep,
                        color: currentPick ? C.cream : `${C.cream}55`,
                        border: `1px solid ${isAuto ? C.green : (currentPick ? C.navyLight : C.red)}66`,
                      }}
                    >
                      <option value="">— skip (no ASL account) —</option>
                      {(allPlayers || []).map(a => (
                        <option key={a.username} value={a.username}>{a.username}</option>
                      ))}
                    </select>
                    {/* TKL override: shows auto value as placeholder, admin types to override */}
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[9px] tracking-widest" style={{ color: `${C.cream}77` }}>TKL</span>
                      <input
                        type="number" min="0"
                        value={overrideVal ?? ''}
                        placeholder={String(autoTkl)}
                        onChange={(e) => setTackleOverrides(prev => ({ ...prev, [p.player_id]: e.target.value }))}
                        className="px-1.5 py-1 rounded font-mono text-xs text-center"
                        style={{
                          background: C.navyDeep,
                          color: overrideVal === undefined || overrideVal === '' ? C.cream : C.goldLight,
                          border: `1px solid ${overrideVal === undefined || overrideVal === '' ? C.navyLight : C.gold}66`,
                          width: 54,
                        }}
                      />
                    </div>
                    {isAuto && <span className="font-mono text-[9px] tracking-wider" style={{ color: C.greenLight }}>AUTO</span>}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
              <b style={{ color: C.greenLight }}>{Object.values(playerMap).filter(Boolean).length}</b> matched · <b style={{ color: C.redLight }}>{Object.values(playerMap).filter(v => !v).length}</b> will be skipped
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="px-4 py-2 rounded font-heading text-xs tracking-wider" style={{ background: `${C.navyLight}33`, color: `${C.cream}88` }}>← BACK</button>
            <button
              onClick={() => setStep(4)}
              className="flex-1 px-4 py-2 rounded font-heading text-xs tracking-wider"
              style={{ background: C.goldLight, color: C.navyDeep }}
            >NEXT: CONFIRM →</button>
          </div>
        </>
      )}

      {/* ---------- STEP 4: CONFIRM ---------- */}
      {step === 4 && matchData && (
        <>
          <div className="p-4 rounded" style={{ background: `${C.goldLight}11`, border: `1px solid ${C.goldLight}44` }}>
            <H>REVIEW & CONFIRM</H>
            <div className="font-mono text-xs space-y-1" style={{ color: C.cream }}>
              <div><b style={{ color: C.goldLight }}>Match:</b> {approvedTeams.find(t => t.id === homeTeamId)?.name} <b>{matchData.score?.home ?? 0} - {matchData.score?.away ?? 0}</b> {approvedTeams.find(t => t.id === awayTeamId)?.name}</div>
              <div><b style={{ color: C.goldLight }}>Season:</b> {currentSeason}</div>
              <div><b style={{ color: C.goldLight }}>Stadium:</b> {matchData.stadium || '—'}</div>
              <div><b style={{ color: C.goldLight }}>Will update:</b> {Object.values(playerMap).filter(Boolean).length} players</div>
              <div><b style={{ color: C.goldLight }}>Will skip:</b> {Object.values(playerMap).filter(v => !v).length} players (no ASL account)</div>
            </div>
            <div className="mt-3 font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
              Stats will be added to each matched player's record. Uploading the same match again is a no-op (deduped by match_id).
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(3)} className="px-4 py-2 rounded font-heading text-xs tracking-wider" style={{ background: `${C.navyLight}33`, color: `${C.cream}88` }}>← BACK</button>
            <button
              onClick={commit}
              disabled={busy}
              className="flex-1 px-4 py-2 rounded font-heading text-xs tracking-wider"
              style={{
                background: C.greenLight, color: C.onColor,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >{busy ? 'IMPORTING…' : `✓ CONFIRM IMPORT (${Object.values(playerMap).filter(Boolean).length} PLAYERS)`}</button>
          </div>
        </>
      )}

      {/* ---------- STEP 5: SUCCESS ---------- */}
      {step === 5 && importResult && (
        <div className="p-4 rounded" style={{ background: `${C.green}15`, border: `1px solid ${C.green}44` }}>
          <div className="font-heading tracking-wider text-lg mb-2" style={{ color: C.greenLight }}>✓ IMPORT COMPLETE</div>
          <div className="font-mono text-xs space-y-1 mb-3" style={{ color: C.cream }}>
            <div><b>{importResult.homeTeam}</b> {importResult.score} <b>{importResult.awayTeam}</b></div>
            <div>Updated: <b style={{ color: C.greenLight }}>{importResult.updated}</b> players</div>
            {importResult.alreadyImported > 0 && (
              <div>Already had this match: <b style={{ color: C.goldLight }}>{importResult.alreadyImported}</b></div>
            )}
            {importResult.skipped > 0 && (
              <div>Skipped: <b style={{ color: C.redLight }}>{importResult.skipped}</b> players (no ASL account)</div>
            )}
          </div>
          {importResult.skippedList.length > 0 && (
            <div className="mt-2 p-2 rounded" style={{ background: `${C.red}11`, border: `1px dashed ${C.red}44` }}>
              <div className="font-mono text-[10px] tracking-wider mb-1" style={{ color: C.redLight }}>SKIPPED PLAYERS (need ASL account):</div>
              <div className="font-mono text-[10px] space-y-0.5" style={{ color: `${C.cream}88` }}>
                {importResult.skippedList.map(s => (
                  <div key={s.playerId}>· {s.strikersName} (id {s.playerId}) — {s.reason}</div>
                ))}
              </div>
            </div>
          )}
          <button onClick={startOver} className="mt-3 px-4 py-2 rounded font-heading text-xs tracking-wider" style={{ background: C.goldLight, color: C.navyDeep }}>
            IMPORT ANOTHER MATCH
          </button>
        </div>
      )}
    </div>
  );
};

