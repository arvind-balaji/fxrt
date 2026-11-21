// Shared contract between the server and the CLI:
// - schemas/: ops, events, errors, wire messages (Zod)
// - rpc/: bidirectional JSON-RPC peer over a Socket
export { DEFAULT_HOST, DEFAULT_PORT } from "./defaults.ts";
export type { Socket } from "./rpc/socket.ts";
