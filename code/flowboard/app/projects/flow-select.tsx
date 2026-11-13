'use client';
/** A flow from the library, or none (`noneLabel` says what none means): `''` in and out. A flow gone from the library stays shown, marked missing. */
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FlowSummary } from '../flows/api.ts';

const NONE = '-'; // Radix keeps '' for "nothing picked"; '-' is no flow name

export function FlowSelect({ id, value, onChange, flows, noneLabel = 'None: pick a flow each run' }: { id: string; value: string; onChange: (flow: string) => void; flows: FlowSummary[] | undefined; noneLabel?: string }) {
  const missing = value && flows && !flows.some((f) => f.name === value);
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger id={id} className="w-full font-mono">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="font-mono">
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        <SelectSeparator />
        {flows?.map((f) => (
          <SelectItem key={f.name} value={f.name}>
            {f.name}
            <span className="text-muted-foreground">
              {' '}
              · {f.steps.length} steps{f.errors ? ' · does not pass the check' : ''}
            </span>
          </SelectItem>
        ))}
        {missing && (
          <SelectItem value={value} className="text-wait">
            {value} · not in the library
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
