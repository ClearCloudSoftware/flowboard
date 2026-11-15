// FlowBoard's desktop shell: starts the Next server with the system `node` and opens a window onto it.
// The server keeps the system node so `flow-start`'s `spawn(process.execPath, …)` still runs run-flow with it.
import { app, BrowserWindow, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullPath } from './path.js';

// Before anything spawns: the server, and every run it starts, inherit this PATH.
process.env.PATH = fullPath();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--dev') ? 'dev' : 'start';
const HOST = '127.0.0.1'; // in the flows API's localhost set, and off the network

// A fixed port keeps the origin, and so the pages' localStorage, the same from one launch to the next.
const listenOn = (port) =>
  new Promise((resolve) => {
    const s = createServer()
      .once('error', () => resolve(undefined))
      .listen(port, HOST, () => {
        const got = s.address().port;
        s.close(() => resolve(got));
      });
  });
const pickPort = async () => (await listenOn(Number(process.env.FLOWBOARD_PORT ?? 3210))) ?? (await listenOn(0));

const fail = (message) => {
  dialog.showErrorBox('FlowBoard could not start', message);
  app.exit(1);
};

let server;

async function serve(port) {
  const next = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  server = spawn('node', [next, mode, '-H', HOST, '-p', String(port)], { cwd: root, stdio: 'inherit' });
  server.once('error', (e) => fail(`Could not run node: ${e.message}. FlowBoard needs node on PATH.`));
  server.once('exit', (code) => {
    server = undefined;
    fail(`The Next server stopped (exit ${code}).${mode === 'start' ? ' Run `pnpm build` first.' : ''}`);
  });
  const url = `http://${HOST}:${port}`;
  // ponytail: polls instead of reading Next's "Ready" line; a dev compile can take a while, hence the long wait.
  for (const end = Date.now() + 120_000; Date.now() < end && server; ) {
    if (await fetch(url, { method: 'HEAD' }).then(() => true, () => false)) return url;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (server) fail(`The Next server did not answer at ${url} within two minutes.`);
}

function open(url) {
  const win = new BrowserWindow({ width: 1440, height: 900, title: 'FlowBoard', show: false });
  const ours = (to) => new URL(to).origin === url;
  // Links to other sites open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url: to }) => {
    if (ours(to)) return { action: 'allow' };
    shell.openExternal(to);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, to) => {
    if (ours(to)) return;
    e.preventDefault();
    shell.openExternal(to);
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(url);
}

app.on('window-all-closed', () => app.quit()); // ponytail: quits on macOS too; the server dies with the window
app.on('will-quit', () => {
  if (!server) return;
  server.removeAllListeners('exit');
  server.kill();
});

app.whenReady().then(async () => {
  const url = await serve(await pickPort());
  if (url) open(url);
});
