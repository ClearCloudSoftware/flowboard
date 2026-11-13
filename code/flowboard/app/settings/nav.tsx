'use client';
/** The settings sidebar: one entry per section, the one shown marked. */
import { Bot, type LucideIcon, Plug, Settings, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const SECTIONS: { href: string; title: string; icon: LucideIcon }[] = [
  { href: '/settings', title: 'General', icon: Settings },
  { href: '/settings/connections', title: 'Connections', icon: Plug },
  { href: '/settings/agents', title: 'Agents', icon: Bot },
  { href: '/settings/defaults', title: 'Defaults', icon: SlidersHorizontal },
];

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-0.5 md:grid">
      {SECTIONS.map(({ href, title, icon: Icon }) => {
        const here = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={here ? 'page' : undefined}
            className={`flex items-center gap-2 border-l-[3px] px-2.5 py-1.5 font-sans text-[13px] ${here ? 'border-run bg-card font-medium text-foreground' : 'border-transparent text-[var(--ink-2)] hover:bg-secondary hover:text-foreground'}`}
          >
            <Icon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
            {title}
          </Link>
        );
      })}
    </nav>
  );
}
