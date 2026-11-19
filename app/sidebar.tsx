'use client';
/**
 * The app's one navigation: a side rail that shows one scope at a time, picked at its top. Lamproom's scope holds the
 * app-wide screens and the app's settings; a project's scope holds that project's screens and its settings. So
 * "Settings" always means the settings of the scope you're in, and the two never share the rail.
 */
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, Blocks, BookOpen, Check, ChevronsUpDown, Coins, Database, FileText, FolderGit2, GitBranch, Inbox, Kanban, LayoutDashboard, LayoutGrid, ListChecks, Settings, SlidersHorizontal, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from '@/components/ui/sidebar';
import { inProject, projectsQuery } from './projects/api.ts';
import { runsQuery } from './runs/api.ts';

const LAST = 'lamproom.project'; // the project whose scope a workspace page belongs to (the last one opened)
const never = () => () => {};
/* Own keys, not runsQuery's and projectsQuery's: a page's Suspense content hydrates after the rail, and if the rail
   had already filled the shared cache, that page would render data the server's HTML didn't have (a hydration error). */
const railRuns = queryOptions({ queryKey: ['rail', 'runs'], queryFn: runsQuery.queryFn, refetchInterval: 5000 });
const railProjects = queryOptions({ queryKey: ['rail', 'projects'], queryFn: projectsQuery.queryFn, refetchInterval: 10_000 });
const onStorage = (change: () => void) => {
  window.addEventListener('storage', change);
  return () => window.removeEventListener('storage', change);
};
const enc = encodeURIComponent;
const label = 'text-[10px] tracking-[0.12em] text-muted-foreground uppercase';

/** `usePathname` suspends under `/p/[slug]`, so the rail renders once with nothing marked, then with the page marked. */
export function AppSidebar() {
  return (
    <Suspense fallback={<Rail path="" />}>
      <Marked />
    </Suspense>
  );
}

function Marked() {
  return <Rail path={usePathname()} />;
}

function Item({ href, icon: Icon, label, active, children }: { href: string; icon: LucideIcon; label: string; active: boolean; children?: ReactNode }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label} className="data-active:shadow-[inset_2px_0_0_var(--run)]">
        <Link href={href}>
          <Icon aria-hidden />
          <span>{label}</span>
          {children}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** A screen the feature map plans but nobody has built: its slot is held so the rail doesn't reshuffle when it lands. */
function Soon({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton aria-disabled tooltip={`${label} · coming soon`} className="text-muted-foreground aria-disabled:opacity-100">
        <Icon aria-hidden />
        <span>{label}</span>
        <span className="ml-auto border border-dashed border-input px-1 text-[9px] leading-[14px] tracking-[0.1em] uppercase">soon</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Runs waiting on you, then runs going. */
function Counts({ waiting, running }: { waiting: number; running: number }) {
  return (
    <span className="ml-auto flex gap-1">
      {waiting > 0 && (
        <span className="bg-wait px-1.5 text-[10px] leading-4 font-semibold text-[var(--wait-ink)]" title={`${waiting} waiting on you`}>
          {waiting}
        </span>
      )}
      {running > 0 && (
        <span className="bg-[var(--run-soft)] px-1.5 text-[10px] leading-4 font-semibold text-run" title={`${running} running`}>
          {running}
        </span>
      )}
    </span>
  );
}

function Rail({ path }: { path: string }) {
  // The rail hydrates twice (fallback, then marked); both passes must render what the server did: no data yet.
  const hydrated = useSyncExternalStore(never, () => true, () => false);
  const projects = useQuery(railProjects);
  const runs = useQuery(railRuns);
  const list = (hydrated && projects.data) || [];
  const all = (hydrated && runs.data) || [];

  const here = path.startsWith('/p/') ? decodeURIComponent(path.split('/')[2]) : null;
  const stored = useSyncExternalStore(onStorage, () => localStorage.getItem(LAST), () => null);
  useEffect(() => {
    if (here) localStorage.setItem(LAST, here);
  }, [here]);
  // ponytail: a workspace page belongs to the last project opened (it is reached from that project's rail); read its ?folder= if one opened from elsewhere lands in the wrong scope
  const p = list.find((x) => x.slug === (here ?? (path.startsWith('/workspaces') ? stored : null)));

  const scoped = p ? all.filter((r) => inProject(p.repoPath, r.folder)) : all;
  const waiting = scoped.filter((r) => r.status === 'waiting' || r.status === 'paused').length;
  const running = scoped.filter((r) => r.status === 'starting' || r.status === 'running').length;

  return (
    <Sidebar collapsible="icon" className="font-mono text-[13px]">
      <SidebarHeader className="gap-1 border-b border-border">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 px-2 font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG mark */}
            <img src="/lamproom-mark.svg" width={22} height={22} alt="" aria-hidden />
            lamproom
          </Link>
          <SidebarTrigger title="Collapse or expand (⌘B)" />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={p ? `Project: ${p.slug}` : 'All projects'} className="border border-border bg-card">
                  {p ? <FolderGit2 aria-hidden /> : <LayoutGrid aria-hidden />}
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className={label}>{p ? 'Project' : 'Lamproom'}</span>
                    <span className="truncate font-medium">{p ? p.slug : 'All projects'}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto" aria-hidden />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56 font-mono text-[13px]">
                <DropdownMenuItem asChild>
                  <Link href="/">
                    <LayoutGrid aria-hidden />
                    All projects
                    {!p && <Check className="ml-auto" aria-label="current" />}
                  </Link>
                </DropdownMenuItem>
                {list.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className={label}>Projects</DropdownMenuLabel>
                  </>
                )}
                {list.map((x) => (
                  <DropdownMenuItem key={x.slug} asChild>
                    <Link href={`/p/${enc(x.slug)}`}>
                      <FolderGit2 aria-hidden />
                      <span className="truncate">{x.slug}</span>
                      {x.slug === p?.slug && <Check className="ml-auto" aria-label="current" />}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {p ? (
            <SidebarMenu>
              <Item href="/" icon={ArrowLeft} label="All projects" active={false} />
              <Item href={`/p/${enc(p.slug)}`} icon={LayoutDashboard} label="Overview" active={here === p.slug} />
              <Soon icon={Kanban} label="Board" />
              <Item href={`/p/${enc(p.slug)}/tasks`} icon={ListChecks} label="Tasks" active={path === `/p/${enc(p.slug)}/tasks`} />
              {/* ponytail: Runs and Settings are sections of the project page until they get routes of their own */}
              <Item href={`/p/${enc(p.slug)}#runs-h`} icon={Activity} label="Runs" active={false}>
                <Counts waiting={waiting} running={running} />
              </Item>
              <Item href={`/workspaces?folder=${enc(p.repoPath)}`} icon={GitBranch} label="Workspaces" active={path.startsWith('/workspaces')} />
              <Soon icon={FileText} label="Artifacts" />
              <Soon icon={Database} label="Memory" />
            </SidebarMenu>
          ) : (
            <SidebarMenu>
              <Soon icon={Inbox} label="Inbox" />
              <Item href="/" icon={FolderGit2} label="Projects" active={path === '/'} />
              <Item href="/runs" icon={Activity} label="Runs" active={path.startsWith('/runs')}>
                <Counts waiting={waiting} running={running} />
              </Item>
              <Item href="/flows" icon={Workflow} label="Flows" active={path.startsWith('/flows')} />
              <Soon icon={Blocks} label="Library" />
              <Soon icon={Coins} label="Cost" />
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          {/* Plain links: the settings page lists its own sections, the docs page its own contents. */}
          {p ? (
            <Item href={`/p/${enc(p.slug)}#project-settings`} icon={SlidersHorizontal} label="Settings" active={false} />
          ) : (
            <Item href="/settings" icon={Settings} label="Settings" active={path.startsWith('/settings')} />
          )}
          <Item href="/docs" icon={BookOpen} label="Docs" active={path.startsWith('/docs')} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
