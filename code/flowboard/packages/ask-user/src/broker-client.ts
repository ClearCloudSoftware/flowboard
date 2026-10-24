import { createConnection } from 'node:net';
import type { AskReply, AskRequest } from '@flowboard/core';

/**
 * Send one request to the broker and wait, however long it takes, for its one-line reply. `address` is a
 * Unix socket path, or `host:port` for a broker on TCP, which wants FLOWBOARD_ASK_TOKEN with each request.
 */
export function askBroker(address: string, request: AskRequest): Promise<AskReply> {
  return new Promise((resolve, reject) => {
    const tcp = /^([^/:]+):(\d+)$/.exec(address);
    const conn = tcp ? createConnection({ host: tcp[1], port: Number(tcp[2]) }) : createConnection(address);
    const token = process.env.FLOWBOARD_ASK_TOKEN;
    let buf = '';
    conn.on('connect', () => conn.write(JSON.stringify(token ? { ...request, token } : request) + '\n'));
    conn.on('data', (d) => {
      buf += d;
      const end = buf.indexOf('\n');
      if (end === -1) return;
      conn.end();
      try {
        resolve(JSON.parse(buf.slice(0, end)) as AskReply);
      } catch {
        reject(new Error(`the broker sent an unreadable reply: ${buf.slice(0, end)}`));
      }
    });
    conn.on('error', (e) => reject(new Error(`cannot reach the question broker: ${e.message}`)));
    conn.on('close', () => reject(new Error('the question broker closed without answering')));
  });
}
