'use client';
/** The canvas: steps as boxes, routes as lines. Drag to arrange, drag from a step's right edge to route it, click to edit. */
import { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useInternalNode,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type { Edge, EdgeChange, EdgeProps, Node, NodeChange, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useSelector } from '@tanstack/react-store';
import { isRework } from '../../packages/core/src/flow/flow.ts';
import { conditionOf, connect, edgesOf, effective, flowDef, layout, nextCondition, NODE_WIDTH, remove, setCondition, stepsOf, target } from './draft.ts';
import type { Condition, Draft, Launch, Step } from './draft.ts';
import { editor } from './editor.ts';
import { GateIcon } from './icons.tsx';

type StepData = { what: string; chips: string[]; budget?: string; gate: boolean; bad: boolean };
type StepNode = Node<StepData, 'step'>;
type RouteData = { index: number; condition: Condition; rework: boolean; bad: boolean };
type RouteEdge = Edge<RouteData, 'route'>;

/** SVG markers take a colour, not a CSS variable: these are the tokens --line-2, --run and --fail. */
const STROKE: Record<Condition, string> = { always: '#CFCBBE', on_pass: '#0E6E74', on_fail: '#B0231B' };
const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** What a step does, in a few words: its command, its skill, its prompt file. */
function what(s: Step, l: Launch): string {
  if (s.shell !== undefined) return `$ ${s.shell}`;
  return l.skill ?? l.prompt ?? (l.system_prompt !== undefined ? 'system prompt only' : 'nothing to do yet');
}

function StepBox({ id, data, selected }: NodeProps<StepNode>) {
  return (
    <div className={cls('cv-n', selected && 'on', data.bad && 'bad')}>
      <Handle type="target" position={Position.Left} />
      <div className="cv-t">
        {id}
        {data.gate && (
          <span className="g" title="waits for your approval">
            <GateIcon />
          </span>
        )}
      </div>
      <div className="cv-s">{data.what}</div>
      <div className="cv-m">
        {data.chips.map((c) => (
          <span key={c}>{c}</span>
        ))}
        {data.budget && <span className="b">{data.budget}</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function RouteLine({ id, source, target: to, sourceX, sourceY, targetX, targetY, data, selected, markerEnd }: EdgeProps<RouteEdge>) {
  const a = useInternalNode(source);
  const b = useInternalNode(to);
  if (!data) return null;
  const { condition, rework, index, bad } = data;
  let path: string, labelX: number, labelY: number;
  if (a && b && (source === to || targetX < sourceX)) {
    // A route back arcs over the top of both steps, so it cannot be mistaken for forward flow.
    const [pa, pb] = [a.internals.positionAbsolute, b.internals.positionAbsolute];
    const ax = pa.x + (a.measured.width ?? NODE_WIDTH) * (source === to ? 0.7 : 0.5);
    const bx = pb.x + (b.measured.width ?? NODE_WIDTH) * (source === to ? 0.3 : 0.5);
    const top = Math.min(pa.y, pb.y) - 56;
    path = `M${ax},${pa.y} C${ax},${top} ${bx},${top} ${bx},${pb.y}`;
    [labelX, labelY] = [(ax + bx) / 2, 0.125 * pa.y + 0.75 * top + 0.125 * pb.y];
  } else {
    [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition: Position.Right, targetX, targetY, targetPosition: Position.Left });
  }
  const label = condition === 'on_pass' ? 'passed' : condition === 'on_fail' ? (rework ? 'failed ↺' : 'failed') : selected ? 'always' : '';
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={cls('route', condition, bad && 'bad')} interactionWidth={18} />
      {label && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={cls('route-label', condition, 'nodrag', 'nopan')}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title="When this route fires: click for always → passed → failed"
            onClick={(e) => {
              e.stopPropagation();
              editor.actions.edit((d) => setCondition(d, index, nextCondition(condition)));
            }}
          >
            {label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { step: StepBox };
const edgeTypes = { route: RouteLine };

export function Canvas({ draft, errors }: { draft: Draft; errors: string[] }) {
  const selection = useSelector(editor, (s) => s.selection);
  const moved = useSelector(editor, (s) => s.moved);
  const flow = useReactFlow();

  // A step just added may sit past the edge of the view: once it is drawn, fit them all in.
  const count = Object.keys(stepsOf(draft)).length;
  const counted = useRef(count);
  useEffect(() => {
    if (count > counted.current) setTimeout(() => void flow.fitView({ padding: 0.25, maxZoom: 1, duration: 200 }), 50);
    counted.current = count;
  }, [count, flow]);
  // The layout follows the steps and routes only, so editing a field does not move anything.
  const graph = JSON.stringify([Object.keys(stepsOf(draft)), edgesOf(draft)]);
  const auto = useMemo(() => layout(draft), [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>([]);
  useEffect(() => {
    const bad = new Set(errors.map(target).flatMap((t) => ('step' in t ? [t.step] : [])));
    setNodes((was) => {
      const measured = new Map(was.map((n) => [n.id, n.measured]));
      return Object.entries(stepsOf(draft)).map(([id, s]) => {
        const l = effective(draft, s);
        const shell = s.shell !== undefined;
        return {
          id,
          type: 'step' as const,
          position: moved[id] ?? auto[id],
          measured: measured.get(id),
          selected: selection !== null && 'step' in selection && selection.step === id,
          ariaLabel: `Step ${id}`,
          data: {
            what: what(s, l),
            // An OpenCode id is provider/model: the model's own name is the part that tells steps apart.
            chips: shell ? ['shell'] : [l.model?.split('/').at(-1) ?? 'no model', ...(l.effort ? [l.effort] : [])],
            budget: !shell && l.limits?.budget_usd !== undefined ? `$${Number(l.limits.budget_usd).toFixed(2)}` : undefined,
            gate: s.gate === 'approval',
            bad: bad.has(id),
          },
        };
      });
    });
  }, [draft, auto, moved, selection, errors, setNodes]);

  const edges = useMemo<RouteEdge[]>(() => {
    const def = flowDef(draft);
    const steps = stepsOf(draft);
    const bad = new Set(errors.map(target).flatMap((t) => ('edge' in t ? [t.edge] : [])));
    const seen = new Map<string, number>();
    return edgesOf(draft).flatMap((e, index) => {
      if (!(e.from in steps) || !(e.to in steps)) return []; // the check names it
      const condition = conditionOf(e);
      const key = `${e.from}->${e.to}`;
      const repeat = seen.get(key) ?? 0;
      seen.set(key, repeat + 1);
      return [
        {
          id: repeat ? `${key}#${repeat}` : key, // from and to name a route; a repeat is an error the check reports
          source: e.from,
          target: e.to,
          type: 'route' as const,
          selected: selection !== null && 'edge' in selection && selection.edge === index,
          markerEnd: { type: MarkerType.ArrowClosed, color: STROKE[condition], width: 14, height: 14 },
          data: { index, condition, rework: isRework(def, { ...e, condition }), bad: bad.has(index) },
        },
      ];
    });
  }, [draft, selection, errors]);

  // Selection lives in the editor, so the inspector follows it; React Flow only reports clicks and keys.
  const onNodes = (changes: NodeChange<StepNode>[]) => {
    for (const c of changes) if (c.type === 'select' && c.selected) editor.actions.select({ step: c.id });
    onNodesChange(changes.filter((c) => c.type !== 'select' && c.type !== 'remove'));
  };
  const onEdges = (changes: EdgeChange<RouteEdge>[]) => {
    for (const c of changes) {
      const index = c.type === 'select' && c.selected ? edges.find((e) => e.id === c.id)?.data?.index : undefined;
      if (index !== undefined) editor.actions.select({ edge: index });
    }
  };

  return (
    <ReactFlow<StepNode, RouteEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodes}
      onEdgesChange={onEdges}
      onPaneClick={() => editor.actions.select(null)}
      onNodeDragStop={(_, n) => editor.actions.move(n.id, n.position)}
      onConnect={(c) => editor.actions.edit((d) => connect(d, c.source, c.target))}
      isValidConnection={(c) => !edgesOf(draft).some((e) => e.from === c.source && e.to === c.target)}
      onDelete={({ nodes: gone, edges: cut }) =>
        editor.actions.edit((d) => remove(d, gone.map((n) => n.id), cut.flatMap((e) => (e.data ? [e.data.index] : []))))
      }
      deleteKeyCode={['Backspace', 'Delete']}
      multiSelectionKeyCode={null}
      selectionKeyCode={null}
      snapToGrid
      snapGrid={[10, 10]}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
      minZoom={0.3}
      maxZoom={1.5}
      connectionRadius={28}
    >
      <Background variant={BackgroundVariant.Lines} gap={24} color="#E4E1D8" />
    </ReactFlow>
  );
}
