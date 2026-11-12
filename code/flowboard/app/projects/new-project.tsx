'use client';
/** The New project dialog: a name, the git repo, the flow type its own flow starts from (or empty), and an optional check command. */
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { libraryQuery } from '../flows/api.ts';
import { createProject } from './api.ts';
import { FlowSelect } from './flow-select.tsx';

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
type Check = (field: { value: string }) => string | undefined;
const required = (what: string): Check => ({ value }) => (value.trim() ? undefined : what);
const pathCheck: Check = ({ value }) =>
  !value.trim() ? 'the folder that holds the git repo' : value.trim().startsWith('/') || value.trim().startsWith('~/') ? undefined : 'an absolute path, or one starting with ~/';
const slugCheck: Check = ({ value }) => (!value || SLUG.test(value) ? undefined : 'lowercase letters, digits and - only');

export function NewProject({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const library = useQuery(libraryQuery);
  const create = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Closed first: Next keeps the list page alive, hidden, so a dialog still open there would cover the new page.
      onClose();
      router.push(`/p/${p.slug}`);
    },
  });
  const form = useForm({
    defaultValues: { name: '', repoPath: '', slug: '', flowType: '', checkCommand: '' },
    onSubmit: ({ value }) =>
      create.mutate({
        name: value.name,
        repoPath: value.repoPath.trim(),
        ...(value.slug && { slug: value.slug }),
        flowType: value.flowType || null,
        ...(value.checkCommand.trim() && { checkCommand: value.checkCommand }),
      }),
  });

  const field = (name: 'name' | 'repoPath' | 'slug' | 'checkCommand', label: string, hint: string, check: Check | undefined, placeholder: string) => (
    <form.Field name={name} validators={check && { onBlur: check, onSubmit: check }}>
      {(f) => (
        <div className="grid gap-1.5">
          <Label htmlFor={`np-${name}`}>{label}</Label>
          <Input
            id={`np-${name}`}
            value={f.state.value}
            onChange={(e) => f.handleChange(e.target.value)}
            onBlur={f.handleBlur}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={f.state.meta.errors.length > 0 || undefined}
            className="font-mono"
          />
          <em className={`text-xs not-italic ${f.state.meta.errors.length ? 'text-fail' : 'text-muted-foreground'}`}>{String(f.state.meta.errors[0] ?? hint)}</em>
        </div>
      )}
    </form.Field>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-sans">New project</DialogTitle>
            <DialogDescription>Connect a git repository on this machine. Every run of the project works in it.</DialogDescription>
          </DialogHeader>
          {field('name', 'Name', 'what the card and the page call it', required('name the project'), 'Billing service')}
          {field('repoPath', 'Repo folder', 'a folder in a git repository; its top folder is the one kept', pathCheck, '~/code/billing-svc')}
          <form.Field name="flowType">
            {(f) => (
              <div className="grid gap-1.5">
                <Label htmlFor="np-flow">Flow type</Label>
                <FlowSelect id="np-flow" value={f.state.value} onChange={f.handleChange} flows={library.data?.flows} noneLabel="Empty: a flow with no steps yet" />
                <em className="text-xs text-muted-foreground not-italic">the project gets its own flow, named after it, started from this one; new runs start on it</em>
              </div>
            )}
          </form.Field>
          {field('slug', 'Slug', 'its address, /p/<slug>; left empty, made from the name', slugCheck, 'from the name')}
          {field('checkCommand', 'Check command', 'what a shell step with no command of its own runs, in the repo; kept in the repo’s .flowboard.yaml', undefined, 'the command your tests run with')}
          {create.error && (
            <pre role="alert" className="border-l-2 border-fail bg-[var(--fail-soft)] px-3 py-2 text-xs whitespace-pre-wrap text-fail">
              {create.error.message}
            </pre>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
