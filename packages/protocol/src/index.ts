// Shared contract between the server and the CLI:
// - schemas/: ops, events, errors, wire messages (Zod)
// - rpc/: bidirectional JSON-RPC peer over a Socket
export type { Socket } from "./rpc/socket.ts";
