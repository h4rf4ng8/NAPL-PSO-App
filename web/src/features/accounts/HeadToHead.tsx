import { Swords } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import type { Account } from './models';
import { EmptyState, RecordBox, ResultBadge, SmallStat } from '../../components/Ui';
import { C } from '../../theme/theme';
import { useResource } from '../../hooks/use-resource';
import { loadAccountMatchPage, loadAccountOpponents } from './history';

export const HeadToHead = ({ account }: { account: Account }) => {
  const [opponent, setOpponent] = useState('');
  const [cursorState, setCursorState] = useState<{ key: string; cursor: string | null; back: (string | null)[] }>({ key: '', cursor: null, back: [] });
  const [refresh, setRefresh] = useState(0);
  const { data: opponents = [], loading: opponentsLoading, error: opponentsError } = useResource(
    () => loadAccountOpponents(account.id, refresh > 0), [account.id, refresh],
  );
  const selected = opponents.find(item => item.opponent === opponent);
  const historyKey = `${account.id}:${opponent}`;
  const cursor = cursorState.key === historyKey ? cursorState.cursor : null;
  const { data: page, loading: historyLoading, error: historyError } = useResource(
    () => opponent ? loadAccountMatchPage(account.id, cursor, null, opponent, refresh > 0) : Promise.resolve({ nodes: [], pageInfo: { endCursor: null, hasNextPage: false } }),
    [account.id, opponent, cursor, refresh],
  );
  useEffect(() => { setOpponent(''); setCursorState({ key: '', cursor: null, back: [] }); }, [account.id]);
  useEffect(() => { setCursorState({ key: historyKey, cursor: null, back: [] }); }, [historyKey]);

  const goNext = () => {
    if (!page?.pageInfo.endCursor) return;
    setCursorState(current => {
      const currentPage = current.key === historyKey ? current : { key: historyKey, cursor: null, back: [] };
      return { ...currentPage, cursor: page.pageInfo.endCursor, back: [...currentPage.back, currentPage.cursor] };
    });
  };
  const goPrevious = () => setCursorState(current => {
    const currentPage = current.key === historyKey ? current : { key: historyKey, cursor: null, back: [] };
    return { ...currentPage, cursor: currentPage.back.at(-1) ?? null, back: currentPage.back.slice(0, -1) };
  });

  return <div>
    <div className="flex items-center gap-2 mb-4">
      <Swords size={22} style={{ color: C.redLight }} />
      <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>HEAD TO HEAD</h3>
    </div>
    {opponentsError && <p role="alert">{opponentsError} <button onClick={() => setRefresh(value => value + 1)}>Retry</button></p>}
    {opponentsLoading ? <p role="status">Loading opponent records…</p> : (opponents.length === 0 ? (
      <EmptyState icon={<Swords size={40} />} text="Log matches to track your record vs each opponent" />
    ) : (
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {opponents.map(o => {
            const active = opponent === o.opponent;
            return <button key={o.opponent} onClick={() => setOpponent(o.opponent)} className="w-full text-left p-3 rounded-lg transition-all" style={{
              background: active ? `${C.green}22` : `${C.navyDeep}aa`, border: `1px solid ${active ? C.green : C.navyLight}66`,
            }}>
              <div className="font-heading text-sm truncate tracking-wider" style={{ color: C.cream }}>{o.opponent.toUpperCase()}</div>
              <div className="font-mono text-[10px] mt-0.5" style={{ color: `${C.cream}66` }}>{o.games} GAMES • <span style={{ color: C.greenLight }}>{o.w}W</span>-<span style={{ color: C.goldLight }}>{o.d}D</span>-<span style={{ color: C.redLight }}>{o.l}L</span></div>
            </button>;
          })}
        </div>

        <div className="md:col-span-2">
          {selected ? <div className="space-y-3">
            <div className="rounded-xl p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}`, boxShadow: `0 2px 8px ${C.brandNavy}11` }}>
              <div className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>{selected.opponent.toUpperCase()}</div>
              <div className="font-mono text-[10px] tracking-widest mb-3" style={{ color: `${C.cream}66` }}>{selected.games} TOTAL MATCHES</div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <RecordBox value={selected.w} label="WINS" color={C.greenLight} />
                <RecordBox value={selected.d} label="DRAWS" color={C.goldLight} />
                <RecordBox value={selected.l} label="LOSSES" color={C.redLight} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <SmallStat value={selected.goals} label="GOALS" />
                <SmallStat value={selected.assists} label="ASSISTS" />
                <SmallStat value={selected.games} label="GAMES" />
              </div>
            </div>
            <div>
              <h4 className="font-display text-xl tracking-wider mb-2" style={{ color: C.cream }}>MATCH HISTORY</h4>
              {historyError && <p role="alert">{historyError} <button onClick={() => { setCursorState({ key: historyKey, cursor: null, back: [] }); setRefresh(value => value + 1); }}>Retry from newest</button></p>}
              {historyLoading ? <p role="status">Loading match history…</p> : <>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {(page?.nodes || []).map((m, i) => <div key={m.id || i} className="rounded p-2 flex items-center gap-3 text-sm" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}33` }}>
                    <ResultBadge result={m.result} small />
                    <div className="flex-1 font-mono text-[10px]" style={{ color: `${C.cream}77` }}>{new Date(m.date || 0).toLocaleDateString()} • {m.season || 'S1'}</div>
                    <div className="font-mono text-xs"><span style={{ color: C.greenLight }}>{m.goals}</span>G <span style={{ color: C.goldLight }}>{m.assists}</span>A</div>
                  </div>)}
                </div>
                <div className="mt-2 flex justify-between">
                  <button disabled={cursorState.back.length === 0 || historyLoading || !!historyError} onClick={goPrevious} className="px-3 py-2 disabled:opacity-40">Previous</button>
                  <button disabled={!page?.pageInfo.hasNextPage || historyLoading || !!historyError} onClick={goNext} className="px-3 py-2 disabled:opacity-40">Next</button>
                </div>
              </>}
            </div>
          </div> : <div className="rounded-xl p-12 text-center font-mono text-sm" style={{ background: `${C.navyDeep}66`, border: `1px dashed ${C.navyLight}66`, color: `${C.cream}55` }}>SELECT AN OPPONENT TO VIEW DETAILS</div>}
        </div>
      </div>
    ))}
  </div>;
};
