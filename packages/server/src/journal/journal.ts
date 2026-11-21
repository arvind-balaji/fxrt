import type { CallId, Ctx, Event, EventDraft, LogPosition, OpName, Outcome } from "@fxrt/protocol";

/**
 * One row of the calls table: a summary of a call, derived from its
 * `call.started` and `call.finished` events. `finished` is null while the call runs.
 */
export interface CallRecord extends Ctx {
  target: OpName;
  input: unknown;
  started: { pos: LogPosition; ts: number };
  finished: { pos: LogPosition; ts: number; outcome: Outcome } | null;
}

/**
 * The append-only event log and the calls table derived from it.
 *
 * The interface is synchronous so that an implementation on bun:sqlite needs no
 * changes in the core. Implementations store events as JSON: what `read` returns
 * is a copy, never the object that was appended.
 */
export interface Journal {
  /**
   * Append an event. The journal sets `pos` (the next position, from 1) and `ts`,
   * and updates the calls table in the same step.
   * Throws `JournalError` if the event does not fit the calls table: a second
   * `call.started` for a call, or progress or finish for an unknown or finished call.
   */
  append(draft: EventDraft): Event;

  /** Events with `pos >= from`, in log order, at most `limit` of them. */
  read(from: LogPosition, limit?: number): Event[];

  /** The position of the last event, or 0 when the log is empty. */
  head(): number;

  /** The calls-table row for a call. */
  call(callId: CallId): CallRecord | undefined;

  close(): void;
}

/** A broken journal invariant. This is a bug in the caller, not a call error. */
export class JournalError extends Error {
  override name = "JournalError";
}
