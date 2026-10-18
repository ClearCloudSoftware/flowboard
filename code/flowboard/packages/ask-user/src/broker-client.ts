import { createConnection } from 'node:net';
import type { AskReply, AskRequest } from '@flowboard/core';

/** Send one request to the broker and wait, however long it takes, for its one-line reply. */
export function askBroker(socketPath: string, request: AskRequest): Promise<AskReply> {
  return new Promise((resolve, reject) => {
    const conn = createConnection(socketPath);
    let buf = '';
    conn.on('connect', () => conn.write(JSON.stringify(request) + '\n'));
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
