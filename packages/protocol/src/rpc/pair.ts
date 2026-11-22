import type { Socket } from "./socket.ts";

/**
 * Two connected in-memory sockets, for tests. Delivery is asynchronous, like a
 * real socket. Messages sent before `close` are still delivered, then both ends
 * see the close.
 */
export function socketPair(): [Socket, Socket] {
  const a = new PairEnd();
  const b = new PairEnd();
  a.other = b;
  b.other = a;
  return [a, b];
}

class PairEnd implements Socket {
  other!: PairEnd;
  #onMessage: (data: string) => void = () => {};
  readonly #onClose: (() => void)[] = [];
  #sendClosed = false;
  #closeSeen = false;

  send(data: string): void {
    if (this.#sendClosed) throw new Error("socket closed");
    const to = this.other;
    queueMicrotask(() => to.#deliver(data));
  }

  onMessage(cb: (data: string) => void): void {
    this.#onMessage = cb;
  }

  onClose(cb: () => void): void {
    this.#onClose.push(cb);
  }

  close(): void {
    if (this.#sendClosed) return;
    for (const end of [this, this.other]) end.#sendClosed = true;
    // Queued after any messages in flight, so those arrive first.
    queueMicrotask(() => {
      for (const end of [this, this.other]) end.#seeClose();
    });
  }

  #deliver(data: string): void {
    if (!this.#closeSeen) this.#onMessage(data);
  }

  #seeClose(): void {
    if (this.#closeSeen) return;
    this.#closeSeen = true;
    for (const cb of this.#onClose) cb();
  }
}
