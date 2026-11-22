import { ClientApi, type Event, Peer, parseEvent, ServerApi, type Socket } from "@fxrt/protocol";

export type Client = ReturnType<typeof client>;

/** A client peer that collects events by subscription ID. */
export function client(socket: Socket) {
  const peer = new Peer(socket, { local: ClientApi, remote: ServerApi });
  const events = new Map<string, Event[]>();
  peer.on("event", ({ subscriptionId, event }) => {
    const parsed = parseEvent(event);
    if (!parsed.known) throw new Error(`unexpected kind: ${parsed.event.kind}`);
    const list = events.get(subscriptionId) ?? [];
    list.push(parsed.event);
    events.set(subscriptionId, list);
  });
  return { peer, events, of: (id: string) => events.get(id) ?? [] };
}

/** Wait until `check` returns true, polling every millisecond. */
export async function until(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 1));
  }
}

/** Let in-flight messages arrive. */
export const settle = () => new Promise((r) => setTimeout(r, 10));
