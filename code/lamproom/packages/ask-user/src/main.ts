import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAskServer } from './server.ts';

const socketPath = process.env.LAMPROOM_ASK_SOCKET;
if (!socketPath) {
  console.error('ask-user: LAMPROOM_ASK_SOCKET is not set');
  process.exit(1);
}
await createAskServer(socketPath, process.env.LAMPROOM_OUTCOME_FILE).connect(new StdioServerTransport());
