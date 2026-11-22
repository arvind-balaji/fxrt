// Shared contract between the server and the CLI:
// - schemas/: ops, calls, errors, events (Zod)
// - rpc/: bidirectional JSON-RPC peer over a Socket, and the server and client APIs
export { DEFAULT_HOST, DEFAULT_PORT } from "./defaults.ts";
export * from "./rpc/api.ts";
export * from "./rpc/jsonrpc.ts";
export { socketPair } from "./rpc/pair.ts";
export * from "./rpc/peer.ts";
export type { Socket } from "./rpc/socket.ts";
export * from "./schemas/index.ts";
