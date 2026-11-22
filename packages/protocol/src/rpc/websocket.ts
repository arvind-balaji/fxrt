import type { Socket } from "./socket.ts";

/** Connect a standard WebSocket and adapt it to Socket. Rejects if it fails to open. */
export function connectWebSocket(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const socket = new WebSocketSocket(ws);
    ws.addEventListener("open", () => resolve(socket), { once: true });
    ws.addEventListener(
      "error",
      () => {
        if (ws.readyState !== WebSocket.OPEN) reject(new Error(`connect failed: ${url}`));
      },
      { once: true },
    );
  });
}

class WebSocketSocket implements Socket {
  readonly #ws: WebSocket;
  // Holds messages that arrive before onMessage is set.
  #queue: string[] | null = [];
  #onMessage: ((data: string) => void) | null = null;
  readonly #onClose: (() => void)[] = [];

  constructor(ws: WebSocket) {
    this.#ws = ws;
    ws.addEventListener("message", (e) => this.#receive(String(e.data)));
    ws.addEventListener("close", () => {
      for (const cb of this.#onClose) cb();
    });
  }

  send(data: string): void {
    if (this.#ws.readyState !== WebSocket.OPEN) throw new Error("socket closed");
    this.#ws.send(data);
  }

  onMessage(cb: (data: string) => void): void {
    this.#onMessage = cb;
    for (const data of this.#queue ?? []) cb(data);
    this.#queue = null;
  }

  onClose(cb: () => void): void {
    this.#onClose.push(cb);
  }

  close(): void {
    this.#ws.close();
  }

  #receive(data: string): void {
    if (this.#onMessage) this.#onMessage(data);
    else this.#queue?.push(data);
  }
}
