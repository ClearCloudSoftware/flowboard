/** Lamproom's loading sign: the lamp room with its beam turning (docs/branding/lamproom). A span, so it fits inside <p> and <pre>. */
export function Loader({ label = 'Loading…', size = 20, className = '' }: { label?: string; size?: number; className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-muted-foreground ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- an animated SVG; next/image adds nothing */}
      <img src="/lamproom-animated.svg" width={size} height={size} alt="" aria-hidden />
      {label}
    </span>
  );
}
