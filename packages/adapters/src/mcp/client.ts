/**
 * McpClient — Lamproom's thin wrapper around @modelcontextprotocol/sdk client.
 *
 * Two jobs:
 *   1. Isolate SDK version drift to one file. Adapters import from here, not
 *      directly from `@modelcontextprotocol/sdk/client/*`. When the SDK bumps
 *      a major version or renames an export, we update this file; adapters
 *      stay untouched.
 *   2. Provide a stable error shape (McpTransportError, McpCallError) that
 *      `mapMcpError` can route to `RetryableError` when appropriate.
 *
 * The McpTransport interface is Lamproom's abstraction over the SDK's
 * Transport type — adapters consume McpTransport, test code implements it,
 * and the real httpTransport factory (in transport.ts) bridges to the SDK.
 *
 * See docs/superpowers/specs/2026-11-17-task-source-jira-mcp-design.md.
 */

import { mapMcpError } from './errors.ts';

/**
 * One MCP tool as advertised by the server. Only the fields Lamproom uses
 * today; extend as adapters need more.
 */
export interface McpToolDescriptor {
  name: string;
  description?: string;
}

/**
 * A transport into an MCP server. Implementations:
 *   - httpTransport (transport.ts) wraps the SDK's StreamableHTTPClientTransport.
 *   - stdioTransport (transport.ts, stub) will wrap the SDK's StdioClientTransport
 *     when a Docker-backed adapter needs it.
 *   - tests implement the three methods directly.
 *
 * `signal` on callTool is optional; implementations that cannot honour
 * cancellation ignore it. Lamproom's real adapter always passes one.
 */
export interface McpTransport {
  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  listTools(): Promise<McpToolDescriptor[]>;
  close(): Promise<void>;
}

/**
 * Wraps an McpTransport, routes errors through mapMcpError so retryable
 * transport failures surface as RetryableError.
 */
export class McpClient {
  private readonly transport: McpTransport;

  constructor(transport: McpTransport) {
    this.transport = transport;
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    try {
      return await this.transport.listTools();
    } catch (err) {
      throw mapMcpError(err);
    }
  }

  async callTool<T>(
    name: string,
    args: Record<string, unknown>,
    opts: { signal: AbortSignal },
  ): Promise<T> {
    try {
      return (await this.transport.callTool(name, args, opts.signal)) as T;
    } catch (err) {
      throw mapMcpError(err);
    }
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
