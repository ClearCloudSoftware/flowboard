'use client';
/** The settings sidebar: one entry per section, the one shown marked; a section with pages lists them under it while open. */
import { Bot, type LucideIcon, Plug, Settings, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const SECTIONS: { href: string; title: string; icon: LucideIcon; pages?: { href: string; title: string }[] }[] = [
  { href: '/settings', title: 'General', icon: Settings },
  {
    href: '/settings/connections',
    title: 'Connections',
    icon: Plug,
    pages: [
      { href: '/settings/connections/repositories', title: 'Source repositories' },
      { href: '/settings/connections/tasks', title: 'Task providers' },
      { href: '/settings/connections/escalation', title: 'Escalation channels' },
    ],
  },
  { href: '/settings/agents', title: 'Agents', icon: Bot },
  { href: '/settings/defaults', title: 'Defaults', icon: SlidersHorizontal },
];

const item = 'flex items-center gap-2 border-l-[3px] px-2.5 py-1.5 font-sans text-[13px]';
const mark = (here: boolean) => (here ? 'border-run bg-card font-medium text-foreground' : 'border-transparent text-[var(--ink-2)] hover:bg-secondary hover:text-foreground');

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-0.5 md:grid">
      {SECTIONS.map(({ href, title, icon: Icon, pages }) => {
        const open = !!pages && path.startsWith(`${href}/`);
        return (
          <div key={href} className="contents md:grid md:gap-0.5">
            <Link href={pages ? pages[0].href : href} aria-current={path === href ? 'page' : undefined} className={`${item} ${mark(path === href)} ${open ? 'font-medium text-foreground' : ''}`}>
              <Icon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
              {title}
            </Link>
            {open && (
              <div className="flex basis-full flex-wrap gap-0.5 md:grid">
                {pages.map((p) => (
                  <Link key={p.href} href={p.href} aria-current={path === p.href ? 'page' : undefined} className={`${item} py-1 text-xs md:pl-[34px] ${mark(path === p.href)}`}>
                    {p.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
