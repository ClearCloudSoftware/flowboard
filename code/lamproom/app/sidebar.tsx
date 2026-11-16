'use client';
/** The app's one navigation: a side rail grouped like the feature map (docs/mockups/nav-options.html, option B). */
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Activity, Blocks, BookOpen, ChevronsUpDown, Settings, Coins, Database, FileText, FolderGit2, GitBranch, Inbox, Kanban, LayoutDashboard, LayoutGrid, ListChecks, SlidersHorizontal, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import type { Doc } from './docs/render.ts';
import { projectsQuery } from './projects/api.ts';
import { runsQuery } from './runs/api.ts';
import { SECTIONS } from './settings/nav.tsx';

const LAST = 'lamproom.project'; // the project the rail shows when the page isn't one project's own
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
export function AppSidebar({ docs }: { docs: Doc['toc'] }) {
  return (
    <Suspense fallback={<Rail path="" docs={docs} />}>
      <Marked docs={docs} />
    </Suspense>
  );
}

function Marked({ docs }: { docs: Doc['toc'] }) {
  return <Rail path={usePathname()} docs={docs} />;
}

const menuLabel = 'text-[10px] tracking-[0.12em] text-muted-foreground uppercase';

/** App-wide settings and the docs, out of the way at the foot of the rail: a menu, a submenu each, settings' sections nested. */
function AppMenu({ path, docs }: { path: string; docs: Doc['toc'] }) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip="Settings & docs" isActive={path.startsWith('/settings') || path.startsWith('/docs')} className="data-active:shadow-[inset_2px_0_0_var(--run)]">
            <Settings aria-hidden />
            <span>Settings &amp; docs</span>
            <ChevronsUpDown className="ml-auto" aria-hidden />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="min-w-56 font-mono text-[13px]">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SlidersHorizontal aria-hidden />
              Settings
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52 font-mono text-[13px]">
              <DropdownMenuLabel className={menuLabel}>Lamproom on this machine</DropdownMenuLabel>
              {SECTIONS.map(({ href, title, icon: Icon, pages }) =>
                pages ? (
                  <DropdownMenuSub key={href}>
                    <DropdownMenuSubTrigger>
                      <Icon aria-hidden />
                      {title}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-48 font-mono text-[13px]">
                      {pages.map((pg) => (
                        <DropdownMenuItem key={pg.href} asChild>
                          <Link href={pg.href}>{pg.title}</Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href}>
                      <Icon aria-hidden />
                      {title}
                    </Link>
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <BookOpen aria-hidden />
              Docs
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-56 font-mono text-[13px]">
              <DropdownMenuItem asChild>
                <Link href="/docs">Running agent work</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className={menuLabel}>Jump to</DropdownMenuLabel>
              {docs.map((t) => (
                <DropdownMenuItem key={t.id} asChild>
                  {/* the titles are rendered inline markdown; the menu wants the words */}
                  <Link href={`/docs#${t.id}`}>{t.title.replace(/<[^>]+>/g, '')}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
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

function Rail({ path, docs }: { path: string; docs: Doc['toc'] }) {
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
          lamproom
        </Link>
        <SidebarTrigger title="Collapse or expand (⌘B)" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <Soon icon={Inbox} label="Inbox" />
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
              <Soon icon={Kanban} label="Board" />
              <Soon icon={ListChecks} label="Tasks" />
              {/* ponytail: Runs and Settings are sections of the project page until they get routes of their own */}
              <Item href={`/p/${encodeURIComponent(p.slug)}#runs-h`} icon={Activity} label="Runs" active={false} />
              <Item href={`/workspaces?folder=${encodeURIComponent(p.repoPath)}`} icon={GitBranch} label="Workspaces" active={path.startsWith('/workspaces')} />
              <Soon icon={FileText} label="Artifacts" />
              <Soon icon={Database} label="Memory" />
              <Item href={`/p/${encodeURIComponent(p.slug)}#project-settings`} icon={SlidersHorizontal} label="Settings" active={false} />
            </SidebarMenu>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-[0.12em] uppercase">Build</SidebarGroupLabel>
          <SidebarMenu>
            <Item href="/flows" icon={Workflow} label="Flows" active={path.startsWith('/flows')} />
            <Soon icon={Blocks} label="Library" />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-[0.12em] uppercase">Steer</SidebarGroupLabel>
          <SidebarMenu>
            <Soon icon={Coins} label="Cost" />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <AppMenu path={path} docs={docs} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
