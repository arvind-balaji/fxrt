import {
  type CallId,
  type CallRequest,
  type Ctx,
  type Event,
  type EventDraft,
  type LogPosition,
  type OpName,
  Outcome,
} from "@fxrt/protocol";
import { getLogger } from "@logtape/logtape";
import { z } from "zod";
import type { Journal } from "../journal/journal.ts";
import { coreError, type ExecContext, type Execution, type Result } from "./op.ts";
import { Registry } from "./registry.ts";

const log = getLogger(["fxrt", "core"]);

const READ_BATCH = 256;

export interface CoreOptions {
  journal: Journal;
  registry?: Registry;
  newId?: () => string;
}

export interface InvokeOptions {
  /** Also cancels the call's children. */
  signal?: AbortSignal;
}

/** Each iteration replays the call from `call.started`. Stopping early does not cancel it. */
export class CallStream implements AsyncIterable<Event> {
  constructor(
    readonly ctx: Ctx,
    /** Never rejects for call errors. */
    readonly outcome: Promise<Outcome>,
    private readonly events: () => AsyncIterator<Event>,
  ) {}

  [Symbol.asyncIterator](): AsyncIterator<Event> {
    return this.events();
  }
}

export class Core {
  readonly registry: Registry;
  readonly #journal: Journal;
  readonly #newId: () => string;
  readonly #running = new Map<CallId, AbortSignal>();
  readonly #waiters = new Set<() => void>();

  constructor(opts: CoreOptions) {
    this.#journal = opts.journal;
    this.registry = opts.registry ?? new Registry();
    this.#newId = opts.newId ?? (() => Bun.randomUUIDv7());
  }

  /**
   * `call.started` is journaled before this returns; the call runs in the background.
   * Only a journal failure throws.
   */
  invoke(req: CallRequest, opts: InvokeOptions = {}): CallStream {
    const { ctx, problem } = this.#assignCtx(req);
    const started = this.#append({
      kind: "call.started",
      ...ctx,
      target: req.target,
      input: req.input,
    });

    const signals = [opts.signal, ctx.parentId ? this.#running.get(ctx.parentId) : undefined];
    const signal = AbortSignal.any(signals.filter((s) => s !== undefined));
    this.#running.set(ctx.callId, signal);

    const outcome = this.#run(ctx, req.target, req.input, signal, problem).catch((err: unknown) => {
      // Only the journal can fail here, so the call stays unfinished in it.
      log.error("journal append failed {callId}", { callId: ctx.callId, error: err });
      return coreError("exception", messageOf(err));
    });

    return new CallStream(ctx, outcome, () => this.#callEvents(ctx.callId, started.pos));
  }

  /** `from` is inclusive. The default skips the backlog and follows only new events. */
  subscribe(
    from: LogPosition = this.#journal.head() + 1,
    opts: { signal?: AbortSignal } = {},
  ): AsyncIterable<Event> {
    return this.#tail(from, opts.signal);
  }

  #assignCtx(req: CallRequest): { ctx: Ctx; problem?: string } {
    const callId = this.#newId();
    if (req.parentId === undefined) {
      const threadId = req.threadId ?? this.#newId();
      return { ctx: { callId, parentId: null, rootId: callId, threadId } };
    }
    const parent = this.#journal.call(req.parentId);
    if (!parent) {
      // Nothing to inherit: record it as its own root so the failure is still journaled.
      const threadId = req.threadId ?? this.#newId();
      return {
        ctx: { callId, parentId: req.parentId, rootId: callId, threadId },
        problem: `unknown parent call: ${req.parentId}`,
      };
    }
    const ctx = {
      callId,
      parentId: parent.callId,
      rootId: parent.rootId,
      threadId: parent.threadId,
    };
    if (req.threadId !== undefined && req.threadId !== parent.threadId) {
      return {
        ctx,
        problem: `thread ${req.threadId} is not the parent's thread ${parent.threadId}`,
      };
    }
    return { ctx };
  }

  async #run(
    ctx: Ctx,
    target: OpName,
    input: unknown,
    signal: AbortSignal,
    problem: string | undefined,
  ): Promise<Outcome> {
    let outcome: Outcome;
    try {
      outcome = problem
        ? coreError("invalid_input", problem)
        : await this.#execute(ctx, target, input, signal);
    } catch (err) {
      outcome = coreError("exception", messageOf(err));
    } finally {
      this.#running.delete(ctx.callId);
    }
    this.#append({ kind: "call.finished", ...ctx, outcome });
    return outcome;
  }

  async #execute(ctx: Ctx, target: OpName, input: unknown, signal: AbortSignal): Promise<Outcome> {
    const op = this.registry.get(target);
    if (!op) return coreError("no_executor", `no executor for op: ${target}`);

    const parsedInput = await op.input.safeParseAsync(input);
    if (!parsedInput.success) {
      return coreError("invalid_input", z.prettifyError(parsedInput.error));
    }

    const cx: ExecContext = {
      ctx,
      signal,
      invoke: (childTarget, childInput) =>
        this.invoke({ target: childTarget, input: childInput, parentId: ctx.callId }),
    };
    const result = Outcome.safeParse(await this.#drive(op.run(parsedInput.data, cx), ctx));
    if (!result.success) {
      return coreError("invalid_output", `op returned a malformed result: ${target}`);
    }
    if (!result.data.ok) return result.data;

    const parsedOutput = await op.output.safeParseAsync(result.data.value);
    if (!parsedOutput.success) {
      return coreError("invalid_output", z.prettifyError(parsedOutput.error));
    }
    return { ok: true, value: parsedOutput.data };
  }

  async #drive(execution: Execution<unknown>, ctx: Ctx): Promise<unknown> {
    if (!isAsyncGenerator(execution)) return await execution;
    for (;;) {
      const step = await execution.next();
      if (step.done) return step.value;
      this.#append({ kind: "call.progress", ...ctx, chunk: step.value });
    }
  }

  #append(draft: EventDraft): Event {
    const event = this.#journal.append(draft);
    for (const wake of [...this.#waiters]) wake();
    return event;
  }

  async *#tail(from: LogPosition, signal?: AbortSignal): AsyncGenerator<Event, void, undefined> {
    let next = from;
    while (!signal?.aborted) {
      const batch = this.#journal.read(next, READ_BATCH);
      // Read and wait in the same tick, so no append slips in between.
      if (batch.length === 0) {
        await this.#nextAppend(signal);
        continue;
      }
      for (const event of batch) {
        if (signal?.aborted) return;
        next = event.pos + 1;
        yield event;
      }
    }
  }

  async *#callEvents(callId: CallId, from: LogPosition): AsyncGenerator<Event, void, undefined> {
    for await (const event of this.#tail(from)) {
      if (event.callId !== callId) continue;
      yield event;
      if (event.kind === "call.finished") return;
    }
  }

  #nextAppend(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const wake = () => {
        this.#waiters.delete(wake);
        signal?.removeEventListener("abort", wake);
        resolve();
      };
      this.#waiters.add(wake);
      signal?.addEventListener("abort", wake, { once: true });
    });
  }
}

function isAsyncGenerator<T>(x: Execution<T>): x is AsyncGenerator<unknown, Result<T>, undefined> {
  return typeof (x as Partial<AsyncGenerator>).next === "function";
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
