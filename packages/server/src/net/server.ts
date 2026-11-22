import type { Socket } from "@fxrt/protocol";
import { getLogger } from "@logtape/logtape";
import type { ServerWebSocket } from "bun";
import type { Core } from "../core/core.ts";
import { Connection } from "./connection.ts";

const log = getLogger(["fxrt", "net"]);

interface ConnData {
  id: number;
  socket?: ServerSocket;
}

/** Serves the core over WebSocket, on any path. Port 0 picks a free port. */
export function serve(core: Core, opts: { hostname: string; port: number }) {
  let nextId = 1;
  return Bun.serve({
    hostname: opts.hostname,
    port: opts.port,
    fetch(req, server) {
      if (server.upgrade(req, { data: { id: nextId++ } })) return;
      return new Response("websocket only", { status: 426, headers: { Upgrade: "websocket" } });
    },
    websocket: {
      data: {} as ConnData,
      open(ws) {
        const socket = new ServerSocket(ws);
        ws.data.socket = socket;
        new Connection(core, socket);
        log.info("connect {conn}", { conn: ws.data.id });
      },
      message(ws, message) {
        ws.data.socket?.receive(typeof message === "string" ? message : message.toString("utf8"));
      },
      close(ws, code) {
        ws.data.socket?.closed();
        log.info("disconnect {conn}", { conn: ws.data.id, code });
      },
    },
  });
}

class ServerSocket implements Socket {
  readonly #ws: ServerWebSocket<ConnData>;
  #onMessage: (data: string) => void = () => {};
  readonly #onClose: (() => void)[] = [];
  #closed = false;

  constructor(ws: ServerWebSocket<ConnData>) {
    this.#ws = ws;
  }

  send(data: string): void {
    if (this.#closed) throw new Error("socket closed");
    // 0 means Bun dropped the message; -1 (backpressure) still sends it.
    if (this.#ws.send(data) === 0) throw new Error("send dropped");
  }

  onMessage(cb: (data: string) => void): void {
    this.#onMessage = cb;
  }

  onClose(cb: () => void): void {
    this.#onClose.push(cb);
  }

  close(): void {
    this.#ws.close();
  }

  receive(data: string): void {
    this.#onMessage(data);
  }

  closed(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const cb of this.#onClose) cb();
  }
}
