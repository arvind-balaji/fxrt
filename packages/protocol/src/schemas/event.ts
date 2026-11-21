import { z } from "zod";
import { Ctx } from "./call.ts";
import { Outcome } from "./error.ts";
import { LogPosition, OpName } from "./names.ts";

// Every event has a log position and a time, both set by the journal on append.
const Base = z.object({
  pos: LogPosition,
  /** Milliseconds since the Unix epoch. */
  ts: z.number().int().nonnegative(),
});

// Call events also carry the IDs of their call.
const CallBase = Base.extend(Ctx.shape);

export const CallStarted = CallBase.extend({
  kind: z.literal("call.started"),
  target: OpName,
  input: z.unknown(),
});

/** One chunk from a streaming op. Chunks have no schema. */
export const CallProgress = CallBase.extend({
  kind: z.literal("call.progress"),
  chunk: z.unknown(),
});

export const CallFinished = CallBase.extend({
  kind: z.literal("call.finished"),
  outcome: Outcome,
});

/** The wire form of a pending interaction call, such as `ask`. */
export const InteractionRequest = CallBase.extend({
  kind: z.literal("interaction.request"),
  target: OpName,
  input: z.unknown(),
});

/** A connection was lost. Its calls in progress then finish with `interrupted`. */
export const ConnectionLost = Base.extend({
  kind: z.literal("connection.lost"),
  connectionId: z.string().min(1),
});

export const Event = z.discriminatedUnion("kind", [
  CallStarted,
  CallProgress,
  CallFinished,
  InteractionRequest,
  ConnectionLost,
]);
export type Event = z.infer<typeof Event>;
export type EventKind = Event["kind"];

/** An event before the journal appends it: no position or time yet. */
export type EventDraft = DraftOf<Event>;
type DraftOf<E> = E extends unknown ? Omit<E, "pos" | "ts"> : never;

const KNOWN_KINDS: ReadonlySet<string> = new Set(Event.options.map((o) => o.shape.kind.value));

/**
 * An event of a kind this build does not know. Clients show it as plain output,
 * not as an error.
 */
export const UnknownEvent = Base.extend({ kind: z.string() }).loose();
export type UnknownEvent = z.infer<typeof UnknownEvent>;

/** Parse an event from the wire. Known kinds are validated; other kinds pass through. */
export function parseEvent(
  data: unknown,
): { known: true; event: Event } | { known: false; event: UnknownEvent } {
  const known = Event.safeParse(data);
  if (known.success) return { known: true, event: known.data };
  const kind = (data as { kind?: unknown } | null)?.kind;
  if (typeof kind === "string" && !KNOWN_KINDS.has(kind)) {
    return { known: false, event: UnknownEvent.parse(data) };
  }
  // A known kind with bad fields is a protocol error, not an unknown event.
  throw known.error;
}
