'use client';
/** The app's one navigation: a side rail grouped like the feature map (docs/mockups/nav-options.html, option B). */
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Activity, BookOpen, ChevronsUpDown, FolderGit2, GitBranch, LayoutDashboard, LayoutGrid, SlidersHorizontal, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { projectsQuery } from './projects/api.ts';
import { runsQuery } from './runs/api.ts';

const LAST = 'flowboard.project'; // the project the rail shows when the page isn't one project's own
const never = () => () => {};
/* Own keys, not runsQuery's and projectsQuery's: a page's Suspense content hydrates after the rail, and if the rail
   had already filled the shared cache, that page would render data the server's HTML didn't have (a hydration error). */
const railRuns = queryOptions({ queryKey: ['rail', 'runs'], queryFn: runsQuery.queryFn, refetchInterval: 5000 });
const railProjects = queryOptions({ queryKey: ['rail', 'projects'], queryFn: projectsQuery.queryFn, refetchInterval: 10_000 });
const onStorage = (change: () => void) => {
  window.addEventListener('storage', change);
  return () => window.removeEventListener('storage', change);
};

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

function Rail({ path }: { path: string }) {
  // The rail hydrates twice (fallback, then marked); both passes must render what the server did: no data yet.
  const hydrated = useSyncExternalStore(never, () => true, () => false);
  const projects = useQuery(railProjects);
  const runs = useQuery(railRuns);
  const waiting = !hydrated ? 0 : runs.data?.filter((r) => r.status === 'waiting' || r.status === 'paused').length ?? 0;
  const running = !hydrated ? 0 : runs.data?.filter((r) => r.status === 'starting' || r.status === 'running').length ?? 0;

  const here = path.startsWith('/p/') ? decodeURIComponent(path.split('/')[2]) : null;
  // The server has no localStorage, so it renders the first project; the browser then shows the last one opened.
  const stored = useSyncExternalStore(onStorage, () => localStorage.getItem(LAST), () => null);
  const last = here ?? stored;
  useEffect(() => {
    if (here) localStorage.setItem(LAST, here);
  }, [here]);
  const list = (hydrated && projects.data) || [];
  const p = list.find((x) => x.slug === last) ?? list[0];

  return (
    <Sidebar collapsible="icon" className="font-mono text-[13px]">
      <SidebarHeader className="flex-row items-center justify-between">
        <Link href="/" className="px-2 font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          flowboard
        </Link>
        <SidebarTrigger title="Collapse or expand (⌘B)" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <Item href="/runs" icon={Activity} label="Runs" active={path.startsWith('/runs')}>
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
            </Item>
            <Item href="/" icon={FolderGit2} label="Projects" active={path === '/'} />
          </SidebarMenu>
        </SidebarGroup>

        {p && (
          <SidebarGroup className="border-y border-border bg-background">
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton size="lg" tooltip={`Project: ${p.slug}`} className="border border-border bg-card">
                      <FolderGit2 aria-hidden />
                      <span className="grid min-w-0 flex-1 leading-tight">
                        <span className="truncate font-medium">{p.slug}</span>
                        <span className="truncate text-[11px] text-muted-foreground">{p.repoPath}</span>
                      </span>
                      <ChevronsUpDown className="ml-auto" aria-hidden />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-56 font-mono text-[13px]">
                    <DropdownMenuLabel className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Switch project</DropdownMenuLabel>
                    {list.map((x) => (
                      <DropdownMenuItem key={x.slug} asChild>
                        <Link href={`/p/${encodeURIComponent(x.slug)}`}>
                          <FolderGit2 aria-hidden />
                          {x.slug}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/">
                        <LayoutGrid aria-hidden />
                        All projects
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
              <Item href={`/p/${encodeURIComponent(p.slug)}`} icon={LayoutDashboard} label="Overview" active={here === p.slug} />
              <Item href={`/workspaces?folder=${encodeURIComponent(p.repoPath)}`} icon={GitBranch} label="Workspaces" active={path.startsWith('/workspaces')} />
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Library joins Build, and Cost joins Steer, when they're built. */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-[0.12em] uppercase">Build</SidebarGroupLabel>
          <SidebarMenu>
            <Item href="/flows" icon={Workflow} label="Flows" active={path.startsWith('/flows')} />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-[0.12em] uppercase">Steer</SidebarGroupLabel>
          <SidebarMenu>
            <Item href="/settings" icon={SlidersHorizontal} label="Settings" active={path.startsWith('/settings')} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <Item href="/docs" icon={BookOpen} label="Docs" active={path.startsWith('/docs')} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
