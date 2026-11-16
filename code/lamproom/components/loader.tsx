import { cn } from '@/lib/utils';

/** Lamproom's loading sign: the lamp room with its beam turning (docs/branding/lamproom).
 *  Centered in the space a page has by default; `inline` for a spot inside a row or a file pane. A span, so it fits inside <p> and <pre>. */
export function Loader({ label = 'Loading…', size, inline = false, className = '' }: { label?: string; size?: number; inline?: boolean; className?: string }) {
  const box = inline
    ? 'inline-flex items-center gap-2'
    : 'flex min-h-[70vh] w-full flex-col items-center justify-center gap-3 font-mono text-[13px]'; // ponytail: 70vh under a page header lands near the screen's middle
  const px = size ?? (inline ? 16 : 56);
  return (
    <span role="status" className={cn(box, 'text-muted-foreground', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an animated SVG; next/image adds nothing */}
      <img src="/lamproom-animated.svg" width={px} height={px} alt="" aria-hidden />
      {label}
    </span>
  );
}
