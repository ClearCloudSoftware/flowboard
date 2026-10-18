import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAskServer } from './server.ts';

const socketPath = process.env.FLOWBOARD_ASK_SOCKET;
if (!socketPath) {
  console.error('ask-user: FLOWBOARD_ASK_SOCKET is not set');
  process.exit(1);
}
await createAskServer(socketPath).connect(new StdioServerTransport());
