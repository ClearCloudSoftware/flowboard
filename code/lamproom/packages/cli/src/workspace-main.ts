import { cleanWorkspace } from './workspace.ts';

// pnpm runs scripts in the package folder; INIT_CWD is where it was invoked.
process.exitCode = await cleanWorkspace(process.argv.slice(2), { cwd: process.env.INIT_CWD ?? process.cwd() });
