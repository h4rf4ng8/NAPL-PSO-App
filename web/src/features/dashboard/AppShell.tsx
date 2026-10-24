import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeftRight, BarChart3, BookOpen, Calendar, Crown, ExternalLink, Home, LogOut, Moon, Newspaper, Sparkles, Sun, Trophy, UserRound, Users } from 'lucide-react';
import type { Account } from '../accounts/models';
import type { ThemeMode } from '../../theme/theme';
import { ASL_LOGO_DIAMOND } from '../../assets/asl-logos';
import { isAdmin } from '../../utils/league';
import { hashForView } from './navigation';
import { Button } from '../../components/ui/button';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from '../../components/ui/sidebar';

const destinations = [
  { id: 'home', label: 'Home', icon: Home, group: 'League', public: false },
  { id: 'teams', label: 'Teams', icon: Users, group: 'League', public: true },
  { id: 'schedule', label: 'Schedule', icon: Calendar, group: 'League', public: true },
  { id: 'standings', label: 'Standings', icon: Trophy, group: 'League', public: false },
  { id: 'leaderboard', label: 'Stats', icon: BarChart3, group: 'League', public: true },
  { id: 'news', label: 'News', icon: Newspaper, group: 'League', public: true },
  { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight, group: 'League', public: true },
  { id: 'me', label: 'My Card', icon: UserRound, group: 'My Player', public: false },
  { id: 'vote', label: 'Vote TOTW', icon: Trophy, group: 'My Player', public: false },
  { id: 'hof', label: 'Hall of Fame', icon: Crown, group: 'Reference', public: false },
  { id: 'tiers', label: 'Tier Preview', icon: Sparkles, group: 'Reference', public: false },
  { id: 'rules', label: 'Rules', icon: BookOpen, group: 'Reference', public: true },
  { id: 'admin', label: 'Admin', icon: Crown, group: 'Administration', public: false },
];

export const titleForView = (view: string) => destinations.find(item => item.id === view)?.label ?? (view === 'matches' ? 'Match Log' : 'League');
export const isPublicView = (view: string) => destinations.some(item => item.id === view && item.public);

export function LeagueNavigation({ account, view, onNavigate, votingOpen = false }: { account: Account | null; view: string; onNavigate: (view: string) => void; votingOpen?: boolean }) {
  const { openMobile, setOpenMobile } = useSidebar();
  const navigated = useRef(false);
  const navigate = (next: string) => { navigated.current = openMobile; onNavigate(next); setOpenMobile(false); };
  const visible = destinations.filter(item => (account || item.public) && (item.id !== 'admin' || isAdmin(account)) && (item.id !== 'vote' || votingOpen));
  return <Sidebar collapsible="offcanvas" onMobileCloseAutoFocus={event => {
    if (!navigated.current) return;
    event.preventDefault();
    navigated.current = false;
    document.querySelector<HTMLElement>('#page-heading')?.focus();
  }}>
    <SidebarHeader className="border-b p-4">
      <a href={hashForView(account ? 'home' : 'teams')} onClick={event => { event.preventDefault(); navigate(account ? 'home' : 'teams'); }} className="flex min-h-11 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <img src={ASL_LOGO_DIAMOND} alt="" className="h-12 w-12 object-contain" />
        <span><span className="block text-lg font-bold tracking-tight">ASL</span><span className="text-xs text-muted-foreground">Alliance Strikers League</span></span>
      </a>
    </SidebarHeader>
    <SidebarContent>
      <nav aria-label="League navigation">
        {['League', 'My Player', 'Reference', 'Administration'].map(group => {
          const items = visible.filter(item => item.group === group);
          return items.length > 0 && <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>{items.map(item => <SidebarMenuItem key={item.id}>
              <SidebarMenuButton asChild isActive={view === item.id}>
                <a href={hashForView(item.id)} aria-current={view === item.id ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(item.id); }}>
                  <item.icon aria-hidden="true" /><span>{item.label}</span>{item.id === 'vote' && <Badge className="ml-auto" variant="secondary">Open</Badge>}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent>
          </SidebarGroup>;
        })}
      </nav>
    </SidebarContent>
    <SidebarFooter className="border-t p-3">
      <Button variant="ghost" className="justify-start" asChild><a href="https://discord.gg/XP5jjUp7t" target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="mr-2 size-4" /> Join the Discord</a></Button>
    </SidebarFooter>
  </Sidebar>;
}

export function AppShell({ title, navigation, toolbar, children }: { title: string; navigation: ReactNode; toolbar: ReactNode; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previousTitle = useRef(title);
  useEffect(() => {
    if (previousTitle.current !== title) heading.current?.focus();
    previousTitle.current = title;
  }, [title]);
  return <SidebarProvider>
    <a href="#main-content" onClick={event => { event.preventDefault(); heading.current?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-background focus:p-3">Skip to content</a>
    {navigation}
    <SidebarInset className="min-w-0 bg-background">
      <header className="sticky top-0 z-20 flex min-h-20 flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:px-6">
        <SidebarTrigger aria-label="Open navigation" className="size-11 lg:hidden" />
        <h1 id="page-heading" ref={heading} tabIndex={-1} className="min-w-0 flex-1 text-2xl font-semibold tracking-tight outline-none">{title}</h1>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">{toolbar}</div>
      </header>
      <main id="main-content" className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 lg:p-6">{children}</main>
    </SidebarInset>
  </SidebarProvider>;
}

export function ThemeButton({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return <Button variant="ghost" size="icon" onClick={onToggle} aria-label={label} title={label}>{theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}</Button>;
}

export function AccountMenu({ account, onLogout }: { account: Account; onLogout: () => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="outline" className="gap-2" aria-label={`Account menu for ${account.username}`}><Avatar className="size-7"><AvatarFallback>{account.username.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><span className="hidden max-w-40 truncate sm:inline">{account.username}</span></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel className="break-words">{account.username}{isAdmin(account) && <Badge className="ml-2" variant="secondary">Admin</Badge>}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onLogout}><LogOut className="mr-2 size-4" /> Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
