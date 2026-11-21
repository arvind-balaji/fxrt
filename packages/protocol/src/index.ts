// Shared contract between the server and the CLI:
// - schemas/: ops, calls, errors, events (Zod)
// - rpc/: bidirectional JSON-RPC peer over a Socket
export { DEFAULT_HOST, DEFAULT_PORT } from "./defaults.ts";
export type { Socket } from "./rpc/socket.ts";
export * from "./schemas/index.ts";
