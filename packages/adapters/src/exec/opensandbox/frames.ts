/**
 * The relay's wire format, one connection per process: `[type u8][length u32 BE][payload]`.
 * relay.cjs keeps its own copy of these few lines: it runs in the sandbox and cannot import TypeScript.
 */
/** `spec` (host→box, first): the process as JSON `{command,args,cwd,env}`; it never travels in the URL, which has a size limit and lands in logs. */
/** `ping` (box→host): the relay is alive, sent every few seconds whatever the process does. */
export const FRAME = { stdin: 0, stdout: 1, stderr: 2, exit: 3, kill: 4, stdinEnd: 5, spec: 6, ping: 7 } as const;

export function encodeFrame(type: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(5);
  head.writeUInt8(type, 0);
  head.writeUInt32BE(payload.length, 1);
  return Buffer.concat([head, payload]);
}

/** Collects bytes as they arrive and hands back each frame once all of it is in. */
export class FrameReader {
  private buf = Buffer.alloc(0);
  push(chunk: Buffer): Array<{ type: number; payload: Buffer }> {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out = [];
    while (this.buf.length >= 5) {
      const len = this.buf.readUInt32BE(1);
      if (this.buf.length < 5 + len) break;
      out.push({ type: this.buf.readUInt8(0), payload: this.buf.subarray(5, 5 + len) });
      this.buf = this.buf.subarray(5 + len);
    }
    return out;
  }
}
