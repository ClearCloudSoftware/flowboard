import { doctorCli } from './doctor-cli.ts';

const write = (stream: NodeJS.WriteStream) => (s: string) => void stream.write(`${s}\n`);
process.exitCode = await doctorCli(process.argv.slice(2), { out: write(process.stdout), err: write(process.stderr), tty: !!process.stdout.isTTY, env: process.env });
