'use client';
/**
 * One project's memory on its page: what runs saved (Memory, the `local` adapter's file), each with the run it came
 * from, to forget one or all. Shown when memory is off too, so what was saved can still be forgotten. The notes came
 * from agents that read the repo: React renders them as text, never as markup.
 */
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { forgetAllMemory, forgetMemory, memoryQuery } from './api.ts';
import type { ProjectView } from './api.ts';

const small = 'text-[11px] text-muted-foreground';
const head = 'text-[10px] tracking-[0.12em] text-muted-foreground uppercase';
/** `2026-11-15T10:00:00.000Z` -> local `2026-11-15 10:00`. */
const when = (at: string) => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function Memory({ p }: { p: ProjectView }) {
  const queryClient = useQueryClient();
  const memories = useQuery(memoryQuery(p.id));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['memory', p.id] });
  const forget = useMutation({ mutationFn: (memoryId: string) => forgetMemory(p.id, memoryId), onSuccess: refresh });
  const forgetAll = useMutation({ mutationFn: () => forgetAllMemory(p.id), onSuccess: refresh });
  const on = p.settings.memory.value;
  const list = memories.data ?? [];
  const error = memories.error ?? forget.error ?? forgetAll.error;
  return (
    <section className="grid gap-2" aria-label="memory">
      <div className="flex items-center justify-between gap-3">
        <div className={head}>
          memory · {on ? 'on' : 'off'}
          {list.length > 0 && <span className="normal-case tracking-normal"> · {list.length}</span>}
        </div>
        {list.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="hover:border-fail hover:bg-[var(--fail-soft)] hover:text-fail">
                <Trash2 aria-hidden className="size-3.5" /> Forget all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-sans">Forget everything about {p.name}?</AlertDialogTitle>
                <AlertDialogDescription>Later runs start without these {list.length} notes. Runs saved them from their summary and review artifacts and your answers; there is no undo.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep them</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={forgetAll.isPending} onClick={() => forgetAll.mutate()}>
                  Forget all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {!on && <span className={small}>off: runs neither save nor recall; turn it on in the project settings</span>}
      {on && memories.isSuccess && list.length === 0 && <span className={small}>nothing remembered yet</span>}
      {list.length > 0 && (
        <ul className="border border-border bg-card">
          {list.map((m) => (
            <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-3 py-2 last:border-b-0">
              <div className="grid min-w-0 gap-0.5">
                <span className="text-xs break-words whitespace-pre-wrap">{m.text}</span>
                <span className={small}>
                  <Link href={`/runs?run=${encodeURIComponent(m.source.run)}`} className="underline underline-offset-[3px]">
                    run {m.source.run}
                  </Link>
                  {m.source.step && <> · {m.source.step}</>}
                  {m.source.artifact && <> · {m.source.artifact}</>}
                  {m.source.ask && <> · your answer</>} · {when(m.at)}
                </span>
              </div>
              <Button size="sm" variant="ghost" aria-label={`Forget: ${m.text.slice(0, 60)}`} disabled={forget.isPending} onClick={() => forget.mutate(m.id)}>
                <X aria-hidden className="size-3.5" /> Forget
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs text-fail">
          {error.message}
        </p>
      )}
    </section>
  );
}
