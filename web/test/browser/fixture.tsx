import React, { StrictMode, useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { Dialog, ModalShell } from '../../src/components/Dialog';
import { Metric, RecordBox, ResultBadge, EmptyState, QuickStat, Section, ResultRow, TeamPill } from '../../src/components/Display';
import { PlayerCard } from '../../src/components/PlayerCard';
import { ShareableCardModal } from '../../src/components/ShareableCardModal';
import { applyTheme, type ThemeMode } from '../../src/theme/theme';
import { renderCardToBlob } from '../../src/components/player-card-image';
import type { Account, Team } from '../../src/api/models';

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: '#000a', zIndex: 50, display: 'grid', placeItems: 'center' };
const panel: React.CSSProperties = { background: 'white', padding: 24, minWidth: 320, borderRadius: 12, color: '#152238' };
function Mandatory({ close, empty = false }: { close: () => void; empty?: boolean }) {
  return <Dialog label={empty ? 'Empty dialog' : 'Mandatory onboarding'}>
    <div style={panel}>{empty ? 'No focusable controls' : <><p>Required onboarding</p><button onClick={close}>Complete onboarding</button></>}</div>
  </Dialog>;
}
const stats = { games: 12, wins: 8, draws: 2, losses: 2, goals: 24, assists: 9, passes: 80, tackles: 20, deflects: 0, catches: 0, cleanSheets: 2, motm: 3 };
const account: Account = { id: 'fixture-player', username: 'Fixture Player', position: 'ST', teamId: null, imageUrl: null, country: null, stats, seasonStats: { all: stats }, ranking: { score: 82, percentile: 0.73, ranked: true, gamesPlayed: 12, tier: 'GOLD' }, cardStats: [{ season: 'all', cells: ['GOALS', 'TKL/G', 'ASSIST', 'W-L', 'PASS/G', 'GP'].map((label, i) => ({ label, value: String(i + 1) })) }], awards: [], championships: [], totwUntil: null, cheater: false, strikersId: null, steamUrl: null, createdAt: 1 };
const team: Team = { id: 'fixture-team', name: 'Fixture United', tag: 'FXU', color: '#3068b0', description: '', ownerUsername: account.username, members: [account.username], invitations: [], pendingMembers: [], totw: true, totwSetAt: 1, seasons: ['S1'], formation: '4-3-3', lineup: {}, status: 'approved', logoUrl: null, createdAt: 1, reviewedAt: 1, reviewedBy: 'fixture', rejectionReason: null };
const decorated: Account = { ...account, teamId: team.id, awards: [{ awardId: 'striker', season: 'S1' }, { awardId: 'playmaker', season: 'S2' }], championships: [{ season: 'S1', placement: '1', teamId: team.id, awardedAt: 1 }] };
function BrowserStatus() {
  const [status, setStatus] = useState('');
  useEffect(() => {
    const update = () => {
      const element = document.activeElement;
      setStatus(`Focus: ${element?.id || element?.getAttribute('aria-label') || element?.textContent?.slice(0, 45) || element?.tagName}; scroll: ${document.body.style.overflow || 'default'}; dialogs: ${document.querySelectorAll('[role="dialog"]').length}`);
    };
    document.addEventListener('focusin', update);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
    update();
    return () => { document.removeEventListener('focusin', update); observer.disconnect(); };
  }, []);
  return <output id="browser-status" aria-label="Browser focus and scroll status">{status}</output>;
}
function Cards() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState('');
  const [image, setImage] = useState('');
  const [dimensions, setDimensions] = useState('');
  useEffect(() => () => { if (image) URL.revokeObjectURL(image); }, [image]);
  return <section><h2>Player cards</h2><div style={{ display: 'flex', gap: 24, alignItems: 'start', flexWrap: 'wrap', margin: '20px 0' }}>
    <PlayerCard account={account} size="sm" /><PlayerCard account={account} size="md" /><PlayerCard ref={cardRef} account={account} size="lg" />
    <PlayerCard account={{ ...account, username: 'Unranked', ranking: { ...account.ranking, ranked: false, score: 0, tier: 'BRONZE' } }} size="sm" />
  </div><button id="export-card" onClick={async () => {
    try { const blob = await renderCardToBlob(cardRef.current); setResult(`${blob.type}: ${blob.size} bytes`); setDimensions(''); setImage(URL.createObjectURL(blob)); }
    catch (error) { setResult(String(error)); }
  }}>Export actual card PNG</button><output id="export-result">{result}{dimensions && `; ${dimensions}`}</output>{image && <img id="export-preview" alt="Exported player card" src={image} onLoad={event => setDimensions(`${event.currentTarget.naturalWidth}×${event.currentTarget.naturalHeight}`)} style={{ width: 160 }} />}
    <h3>Tier and player variants</h3><div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
      {(['DIAMOND', 'GOLD', 'SILVER', 'BRONZE'] as const).map(tier => <div key={tier} data-card-case={tier}><p>{tier}</p><PlayerCard account={{ ...account, username: tier, ranking: { ...account.ranking, tier } }} size="md" /></div>)}
      <div data-card-case="captain-totw-awards"><p>Captain, TOTW, team, awards, championship</p><PlayerCard account={decorated} team={team} size="lg" /></div>
      <div data-card-case="cheater"><p>Cheater</p><PlayerCard account={{ ...account, cheater: true }} size="md" /></div>
      <div data-card-case="free-agent"><p>Free agent</p><PlayerCard account={account} size="md" /></div>
      <div data-card-case="hidden-team"><p>Hidden team</p><PlayerCard account={decorated} team={team} hideTeam size="md" /></div>
    </div></section>;
}
function Fixture() {
  const [open, setOpen] = useState('');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [nested, setNested] = useState(false);
  const [version, setVersion] = useState(0);
  const [closedBy, setClosedBy] = useState('');
  const close = () => { setClosedBy(String(version)); setOpen(''); setNested(false); };
  return <main style={{ padding: 24, maxWidth: 1100, margin: 'auto' }}>
    <h1>Real component fixture</h1>
    <p>Uses synthetic display data. Development StrictMode enabled.</p><BrowserStatus /><button id="toggle-theme" onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; applyTheme(next); setTheme(next); }}>Theme: {theme}</button>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0' }}>
      <button id="open-dialog" onClick={() => setOpen('dialog')}>Open team details</button>
      <button onClick={() => setOpen('modal')}>Open ModalShell</button>
      <button onClick={() => setOpen('share')}>Open shareable card</button>
      <button onClick={() => setOpen('mandatory')}>Open mandatory onboarding</button>
      <button onClick={() => setOpen('empty')}>Open empty dialog</button>
      <button onClick={() => { setVersion(v => v + 1); }}>Update close callback</button>
      <button id="close-all" onClick={close}>Unmount all</button>
      <output id="closed-by">Closed callback: {closedBy}; current: {version}</output>
    </div>
    <div id="display-widgets" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      <Metric label="GOALS" value={24} />
      <RecordBox value={12} label="WINS" color="#169b62" />
      <ResultBadge result="W" />
      <EmptyState text="No fixtures yet" />
      <QuickStat label="PLAYERS" value={42} accent="#169b62" />
      <Section title="LATEST" onMore={() => {}}><ResultBadge result="D" small /></Section>
      <ResultRow r={{ date: 1_700_000_000_000, homeScore: 3, awayScore: 1 } as Parameters<typeof ResultRow>[0]['r']} home={undefined} away={undefined} />
      <TeamPill fallback="TBD" />
    </div>
    <div id="card-fixtures"><Cards /></div>
    {open === 'dialog' && <Dialog onClose={close} label="Team details" style={overlay} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div style={panel}><h2>Team details</h2>
        <button id="open-picker" onClick={() => setNested(true)}>Choose lineup player</button>
        <button onClick={() => setVersion(v => v + 1)}>Change callback version</button>
        <button onClick={close}>Close team details</button>
        {nested && <Dialog onClose={() => setNested(false)} label="Select lineup player" style={{ ...overlay, zIndex: 60 }} onClick={e => { if (e.target === e.currentTarget) setNested(false); }}>
          <div style={panel}><h2>Select lineup player</h2><button id="first-choice">First player</button><button id="last-choice" onClick={() => setNested(false)}>Cancel picker</button><button onClick={close}>Close all dialogs</button></div>
        </Dialog>}
      </div>
    </Dialog>}
    {open === 'share' && <ShareableCardModal account={decorated} team={team} onClose={close} />}
    {open === 'modal' && <ModalShell title="EDIT ARTICLE" onClose={close}><input aria-label="Article title" defaultValue="Fixture title" /><button onClick={close}>Save article</button></ModalShell>}
    {open === 'mandatory' && <Mandatory close={close} />}
    {open === 'empty' && <Mandatory close={close} empty />}
  </main>;
}
createRoot(document.querySelector('#root')!).render(<StrictMode><Fixture /></StrictMode>);
