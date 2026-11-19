/** The flow-designer mockup's marks (docs/mockups/flow-designer.html). */
import type { Shape } from './draft.ts';

export const GateIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="4.4" y="3.2" width="2.4" height="9.6" fill="currentColor" />
    <rect x="9.2" y="3.2" width="2.4" height="9.6" fill="currentColor" />
  </svg>
);

export const OkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.4 8.3l3.1 3.1 6.1-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const WarnIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2.6L14.6 13.4H1.4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M8 6.6v3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="11.5" r=".9" fill="currentColor" />
  </svg>
);

/** Nodes and edges of each glyph; `loop` is the arc a rework route draws back. */
const SHAPES: Record<Shape, { n: [number, number][]; e: [number, number][]; loop?: [number, number, number, number] }> = {
  linear: { n: [[4, 10], [22, 10], [40, 10], [58, 10]], e: [[0, 1], [1, 2], [2, 3]] },
  fan: { n: [[4, 10], [22, 10], [40, 3], [40, 17], [58, 10]], e: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4]] },
  fanloop: { n: [[4, 10], [22, 10], [40, 3], [40, 17], [58, 10]], e: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4]], loop: [58, 10, 22, 10] },
  loop: { n: [[4, 10], [22, 10], [40, 10], [58, 10]], e: [[0, 1], [1, 2], [2, 3]], loop: [58, 10, 22, 10] },
  branch: { n: [[4, 10], [26, 10], [52, 3], [52, 17]], e: [[0, 1], [1, 2], [1, 3]] },
};

/** A recipe's shape before you open it: grey squares are steps, a dashed red arc sends work back. */
export function Glyph({ shape }: { shape: Shape }) {
  const s = SHAPES[shape];
  return (
    <svg className="glyph" width="62" height="20" viewBox="0 -2 62 22" aria-hidden="true">
      {s.loop && (
        <path
          d={`M${s.loop[0]},${s.loop[1] - 4} C${s.loop[0]},-1 ${s.loop[2]},-1 ${s.loop[2]},${s.loop[3] - 4}`}
          fill="none"
          stroke="#B0231B"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
      {s.e.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={s.n[a][0] + 3} y1={s.n[a][1]} x2={s.n[b][0] - 3} y2={s.n[b][1]} stroke="#CFCBBE" strokeWidth="1" />
      ))}
      {s.n.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" fill="#B8B4A8" />
      ))}
    </svg>
  );
}
