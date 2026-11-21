/**
 * The minimal socket that the RPC layer runs on.
 *
 * The server (Bun.serve) and the CLI (WebSocket client) each adapt their own
 * socket to this interface, so this package has no runtime-specific APIs.
 */
export interface Socket {
  send(data: string): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}
