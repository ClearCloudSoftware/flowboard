import { fileURLToPath } from 'node:url';

/** Absolute path of the shim's entry point, for a RunSpec tool server: `node <SHIM_ENTRY>`. */
export const SHIM_ENTRY = fileURLToPath(new URL('./main.ts', import.meta.url));
export { askBroker } from './broker-client.ts';
