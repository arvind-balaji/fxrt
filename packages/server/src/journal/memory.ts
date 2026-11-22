import type { CallId, Event, EventDraft, LogPosition } from "@fxrt/protocol";
import { type CallRecord, type Journal, JournalError } from "./journal.ts";

/** Stores JSON text, so reads return copies with JSON semantics, as with SQLite. */
export class InMemoryJournal implements Journal {
  // events[i] holds the event at position i + 1.
  readonly #events: string[] = [];
  readonly #calls = new Map<CallId, string>();
  readonly #now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.#now = opts.now ?? Date.now;
  }

  append(draft: EventDraft): Event {
    const event = { ...draft, pos: this.#events.length + 1, ts: this.#now() } as Event;
    const row = this.#nextCallRow(event);
    // Serialize both before storing either, so a failure writes nothing.
    const eventJson = JSON.stringify(event);
    const rowJson = JSON.stringify(row);
    this.#events.push(eventJson);
    if (row) this.#calls.set(event.callId, rowJson);
    return JSON.parse(eventJson);
  }

  read(from: LogPosition, limit = Number.POSITIVE_INFINITY): Event[] {
    const start = Math.max(from, 1) - 1;
    const end = Math.min(this.#events.length, start + limit);
    return this.#events.slice(start, end).map((json) => JSON.parse(json));
  }

  head(): number {
    return this.#events.length;
  }

  call(callId: CallId): CallRecord | undefined {
    const json = this.#calls.get(callId);
    return json === undefined ? undefined : JSON.parse(json);
  }

  close(): void {}

  #nextCallRow(event: Event): CallRecord | undefined {
    const existing = this.call(event.callId);
    switch (event.kind) {
      case "call.started": {
        if (existing) throw new JournalError(`call already started: ${event.callId}`);
        const { callId, parentId, rootId, threadId, target, input, pos, ts } = event;
        return {
          callId,
          parentId,
          rootId,
          threadId,
          target,
          input,
          started: { pos, ts },
          finished: null,
        };
      }
      case "call.progress":
        assertRunning(existing, event);
        return undefined;
      case "call.finished":
        assertRunning(existing, event);
        return { ...existing, finished: { pos: event.pos, ts: event.ts, outcome: event.outcome } };
    }
  }
}

function assertRunning(
  row: CallRecord | undefined,
  event: Event,
): asserts row is CallRecord & { finished: null } {
  if (!row) throw new JournalError(`${event.kind} for unknown call: ${event.callId}`);
  if (row.finished) throw new JournalError(`${event.kind} for finished call: ${event.callId}`);
}
