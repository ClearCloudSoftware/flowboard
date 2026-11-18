/**
 * MCP transport factories.
 *
 * Two transports supported today:
 *   - httpTransport: wraps the SDK's StreamableHTTPClientTransport. Used by
 *     the JiraTaskSource and any future adapter that talks to a hosted MCP
 *     server (Rovo, Linear hosted, Confluence hosted).
 *   - stdioTransport: a stub that throws. Lands when the first Docker-backed
 *     adapter needs it (`sooperset/mcp-atlassian`-style).
 *
 * Both return an McpTransport (Lamproom's abstraction), not the SDK's
 * Transport, so adapter code stays SDK-agnostic.
 *
 * Connection lifecycle: the factory returns an McpTransport whose `callTool`
 * lazily connects on the first call. This defers any network work until the
 * adapter actually fetches, which keeps credential-missing errors cheap (no
 * connection attempt when `{ kind: 'none' }`).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpToolDescriptor, McpTransport } from './client.ts';
import { McpTransportError } from './errors.ts';

export interface HttpTransportOptions {
  /** The MCP server URL (e.g. https://mcp.atlassian.com/v2/mcp). */
  url: string | URL;
  /** Optional bearer token; sent as `Authorization: Bearer <token>`. */
  bearer?: string;
  /** Additional request headers (e.g. `X-Atlassian-Cloud-Id`). */
  headers?: Record<string, string>;
  /** Client identity sent during initialization. Defaults to lamproom/0.1.0. */
  clientInfo?: { name: string; version: string };
}

/**
 * Build an McpTransport over Streamable HTTP. Suitable for hosted MCP servers
 * that speak the current (post-2026-07-28) MCP spec.
 */
export function httpTransport(opts: HttpTransportOptions): McpTransport {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.bearer !== undefined && opts.bearer !== '') {
    headers['Authorization'] = `Bearer ${opts.bearer}`;
  }

  const sdkTransport = new StreamableHTTPClientTransport(new URL(opts.url), {
    requestInit: { headers },
  });
  const client = new Client(
    opts.clientInfo ?? { name: 'lamproom', version: '0.1.0' },
    { capabilities: {} },
  );

  let connected = false;
  let closed = false;

  async function ensureConnected(): Promise<void> {
    if (closed) throw new Error('mcp transport: already closed');
    if (connected) return;
    try {
      await client.connect(sdkTransport);
      connected = true;
    } catch (err) {
      throw rewrapTransportError(err);
    }
  }

  return {
    async callTool(name, args, signal) {
      await ensureConnected();
      try {
        const result = await client.callTool(
          { name, arguments: args },
          undefined,
          signal !== undefined ? { signal } : undefined,
        );
        if (result.isError === true) {
          const content = Array.isArray(result.content) ? result.content : [];
          const text = content
            .filter((c): c is { type: 'text'; text: string } => c?.type === 'text' && typeof c.text === 'string')
            .map((c) => c.text)
            .join('\n');
          throw new Error(text || `MCP tool '${name}' returned an error`);
        }
        return result;
      } catch (err) {
        throw rewrapTransportError(err);
      }
    },
    async listTools() {
      await ensureConnected();
      try {
        const { tools } = await client.listTools();
        return tools.map((t): McpToolDescriptor => ({ name: t.name, description: t.description }));
      } catch (err) {
        throw rewrapTransportError(err);
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      if (connected) await client.close();
    },
  };
}

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Stub — not implemented. Lands when a Docker-backed MCP adapter needs it.
 */
export function stdioTransport(_opts: StdioTransportOptions): McpTransport {
  throw new Error('stdioTransport: not implemented (lands when a Docker-backed MCP adapter needs it)');
}

/**
 * Pull the HTTP status and headers off whatever shape the SDK throws, wrap in
 * our stable McpTransportError. If the shape doesn't match (non-HTTP failure,
 * e.g. DNS), propagate the original error — mapMcpError will wrap it in Error
 * if it's not an Error instance.
 */
function rewrapTransportError(err: unknown): Error {
  if (err instanceof McpTransportError) return err;
  if (err instanceof Error) {
    const anyErr = err as Error & {
      status?: number;
      statusCode?: number;
      response?: { status?: number; headers?: Record<string, string> };
    };
    const status = anyErr.status ?? anyErr.statusCode ?? anyErr.response?.status;
    const headers = anyErr.response?.headers ?? {};
    if (typeof status === 'number') {
      return new McpTransportError(err.message, status, headers);
    }
    return err;
  }
  return new Error(String(err));
}
