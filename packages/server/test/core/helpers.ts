import type { Event } from "@fxrt/protocol";
import { Core } from "../../src/core/core.ts";
import { InMemoryJournal } from "../../src/journal/memory.ts";
import { count } from "../../src/ops/count.ts";

/** A core on a fresh in-memory journal, with predictable IDs and `count` registered. */
export function setup() {
  let next = 0;
  const journal = new InMemoryJournal();
  const core = new Core({ journal, newId: () => `id${++next}` });
  core.registry.register(count);
  return { core, journal };
}

/** Collect events, stopping after `limit` of them. */
export async function collect(events: AsyncIterable<Event>, limit = Infinity): Promise<Event[]> {
  const out: Event[] = [];
  if (limit <= 0) return out;
  for await (const event of events) {
    out.push(event);
    if (out.length >= limit) break;
  }
  return out;
}

export const kinds = (events: Event[]) => events.map((e) => e.kind);

export const chunks = (events: Event[]) =>
  events.flatMap((e) => (e.kind === "call.progress" ? [e.chunk] : []));
