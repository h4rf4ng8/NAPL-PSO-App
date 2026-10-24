import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Activity, Calendar, Edit3, Share2, Shield, Sparkles, Target, TrendingUp, Trophy, User, Zap } from 'lucide-react';
import { TrophyHistory } from '../accounts/TrophyHistory';
import type { Account } from '../accounts/models';
import type { TeamSummary as Team } from '../teams/models';
import { AWARD_BY_ID, AwardIcon } from '../../components/Icons';
import { PlayerCard } from '../../components/PlayerCard';
import { Metric, RecordBox, TeamPill } from '../../components/Display';

import { getStatsForSeason } from '../../utils/rankings';
import { Button } from '../../components/ui/button';


export type CardAction = 'share' | 'image' | 'pos';
interface Props {
  account: Account; season: string; currentSeason: string; allSeasons: string[];
  setSeason: (season: string) => void; myTeam: Team | undefined;
  onEdit: (action: CardAction) => void;
}
export function MyCard({ account, season, currentSeason, allSeasons, setSeason, myTeam, onEdit }: Props) {
  const seasonStats = getStatsForSeason(account, season);
  const games = seasonStats.games || 0;
  const wr = games > 0 ? Math.round(seasonStats.wins / games * 100) : 0;
  const gpg = games > 0 ? (seasonStats.goals / games).toFixed(2) : '0.00';
  const apg = games > 0 ? (seasonStats.assists / games).toFixed(2) : '0.00';
  const accountForCard = { ...account, stats: seasonStats, _cardSeason: season };
  return <div className="space-y-6">
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm font-medium"><Calendar className="size-4 text-primary" />Viewing {season === 'all' ? 'all-time statistics' : `season ${season}`}</div>
      <div className="w-full sm:w-56">
        <Select value={season} onValueChange={setSeason}>
          <SelectTrigger aria-label="Card season"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All time</SelectItem>{allSeasons.map(value => <SelectItem key={value} value={value}>{value}{value === currentSeason ? ' (current)' : ''}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </Card>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col items-center gap-4">
        <div className="w-full max-w-[320px] [&>.flip-card]:aspect-[320/510] [&>.flip-card]:!h-auto [&>.flip-card]:!w-full [&_.flip-card-face>svg]:size-full"><PlayerCard account={accountForCard} size="lg" team={myTeam} /></div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => onEdit('share')}><Share2 />Share card</Button>
          <Button variant="outline" onClick={() => onEdit('image')}><User />Image</Button>
          <Button variant="outline" onClick={() => onEdit('pos')}><Edit3 />Position</Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">Your Discord username updates when you sign in.</p>
        {myTeam && <div className="text-center"><p className="mb-2 text-xs text-muted-foreground">Plays for</p><TeamPill team={myTeam} fallback={null} /></div>}
        {(account.awards || []).length > 0 && <Card className="w-full space-y-3 p-4">
          <h3 className="font-semibold">Trophy cabinet</h3>
          {(account.awards || []).map((award, index) => <div key={index} className="flex items-center gap-2 text-sm"><AwardIcon awardId={award.awardId} size={20} /><span className="min-w-0 flex-1">{AWARD_BY_ID[award.awardId]?.name ?? award.awardId}</span><Badge variant="secondary">{award.season}</Badge></div>)}
        </Card>}
      </div>
      <div className="min-w-0 space-y-6">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 text-primary" />Career overview{season !== 'all' && <Badge variant="secondary">{season}</Badge>}</h3>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric icon={<Activity />} label="Games" value={games} />
            <Metric icon={<TrendingUp />} label="Win rate" value={`${wr}%`} />
            <Metric icon={<Target />} label="Goals" value={seasonStats.goals || 0} />
            <Metric icon={<Zap />} label="Assists" value={seasonStats.assists || 0} />
            <Metric icon={<Target />} label="Goals / game" value={gpg} />
            <Metric icon={<Zap />} label="Assists / game" value={apg} />
            <Metric icon={<Shield />} label="Clean sheets" value={seasonStats.cleanSheets || 0} />
            <Metric icon={<Trophy />} label="Awards" value={account.awardCount ?? account.awards?.length ?? 0} />
          </div>
        </section>
        <section className="space-y-3"><h3 className="text-lg font-semibold">Record</h3><div className="grid grid-cols-3 gap-3">
          <RecordBox value={seasonStats.wins || 0} label="Wins" color="hsl(var(--success))" />
          <RecordBox value={seasonStats.draws || 0} label="Draws" color="hsl(var(--warning))" />
          <RecordBox value={seasonStats.losses || 0} label="Losses" color="hsl(var(--destructive))" />
        </div></section>
      </div>
    </div>
    <TrophyHistory accountId={account.id} />
  </div>;
}
