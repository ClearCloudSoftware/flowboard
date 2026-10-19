/** One-line tool summary for the viewer, e.g. "Bash: pnpm test", "Read src/a.ts", "bash: pnpm test" (OpenCode names). */
export function summarizeTool(name: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>;
  const shell = name === 'Bash' || name === 'bash';
  const target = shell ? args.command : (args.file_path ?? args.filePath ?? args.notebook_path ?? args.pattern ?? args.url);
  const line = typeof target !== 'string' ? name : shell ? `${name}: ${target}` : `${name} ${target}`;
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}
