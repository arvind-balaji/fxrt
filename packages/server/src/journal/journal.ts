import type { CallId, Ctx, Event, EventDraft, LogPosition, OpName, Outcome } from "@fxrt/protocol";

export interface CallRecord extends Ctx {
  target: OpName;
  input: unknown;
  started: { pos: LogPosition; ts: number };
  finished: { pos: LogPosition; ts: number; outcome: Outcome } | null;
}

/**
 * Synchronous, to match bun:sqlite. Events are stored as JSON, so `append` and
 * `read` return copies, never the appended object.
 */
export interface Journal {
  /**
   * Throws `JournalError` on a second `call.started`, or on progress or finish for
   * an unknown or finished call. A rejected append writes nothing.
   */
  append(draft: EventDraft): Event;

  /** `from` is inclusive. */
  read(from: LogPosition, limit?: number): Event[];

  /** 0 when the log is empty. */
  head(): number;

  call(callId: CallId): CallRecord | undefined;

  close(): void;
}

export class JournalError extends Error {
  override name = "JournalError";
}
