/** The projects pages' top bar: the trail back to the list, the page's own actions, then the other screens. */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** `slug`: a project's page; `here`: another top-level page, such as settings. */
export function Topbar({ slug, here, children }: { slug?: string; here?: string; children?: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-2.5">
      <nav aria-label="Where you are" className="font-semibold whitespace-nowrap">
        <Link href="/">flowboard</Link>
        <span className="px-[0.35em] text-input">/</span>
        {slug ? (
          <>
            <Link href="/" className="font-normal text-muted-foreground hover:text-foreground">
              projects
            </Link>
            <span className="px-[0.35em] text-input">/</span>
            <span className="font-normal">{slug}</span>
          </>
        ) : (
          <span className="font-normal text-muted-foreground">{here ?? 'projects'}</span>
        )}
      </nav>
      <span className="flex-1" />
      {children}
      {(['flows', 'runs', 'docs', 'settings'] as const).map((to) => (
        <Button key={to} variant="outline" size="sm" asChild>
          <Link href={`/${to}`} className="capitalize">
            {to}
          </Link>
        </Button>
      ))}
    </header>
  );
}
