import { describe, expect, test } from "bun:test";
import type { Event, Outcome } from "@fxrt/protocol";
import { z } from "zod";
import { defineOp, fail, ok } from "../../src/core/op.ts";
import { chunks, collect, kinds, setup } from "./helpers.ts";

const echo = defineOp({
  name: "echo",
  description: "Return the input.",
  input: z.object({ text: z.string(), times: z.number().default(1) }),
  output: z.object({ text: z.string(), times: z.number() }),
  run: async (input) => ok(input),
});

const errorOf = (outcome: Outcome) => (outcome.ok ? undefined : outcome.error);

describe("a streaming call", () => {
  test("journals started, one progress per chunk, and finished", async () => {
    const { core } = setup();
    const call = core.invoke({ target: "count", input: { n: 3 } });
    const events = await collect(call);

    expect(kinds(events)).toEqual([
      "call.started",
      "call.progress",
      "call.progress",
      "call.progress",
      "call.finished",
    ]);
    expect(chunks(events)).toEqual([1, 2, 3]);
    expect(events.map((e) => e.pos)).toEqual([1, 2, 3, 4, 5]);
    expect(events.at(-1)).toMatchObject({ outcome: { ok: true, value: { count: 3 } } });
    expect(await call.outcome).toEqual({ ok: true, value: { count: 3 } });
  });

  test("the stream is the journal", async () => {
    const { core, journal } = setup();
    const events = await collect(core.invoke({ target: "count", input: { n: 2 } }));
    expect(journal.read(1)).toEqual(events);
  });

  test("call.started is in the journal when invoke returns", () => {
    const { core, journal } = setup();
    const call = core.invoke({ target: "count", input: { n: 2 } });
    expect(journal.read(1)).toMatchObject([
      { kind: "call.started", ...call.ctx, target: "count", input: { n: 2 } },
    ]);
  });

  test("the calls table records the result", async () => {
    const { core, journal } = setup();
    const call = core.invoke({ target: "count", input: { n: 2 } });
    expect(journal.call(call.ctx.callId)?.finished).toBeNull();
    await call.outcome;
    expect(journal.call(call.ctx.callId)).toMatchObject({
      target: "count",
      finished: { pos: 4, outcome: { ok: true, value: { count: 2 } } },
    });
  });

  test("each iteration replays from call.started; stopping does not cancel", async () => {
    const { core } = setup();
    const call = core.invoke({ target: "count", input: { n: 3, delayMs: 1 } });
    expect(kinds(await collect(call, 1))).toEqual(["call.started"]);
    const all = await collect(call);
    expect(all).toHaveLength(5);
    expect(await collect(call)).toEqual(all);
  });

  test("concurrent calls each stream only their own events", async () => {
    const { core } = setup();
    const a = core.invoke({ target: "count", input: { n: 3, delayMs: 1 } });
    const b = core.invoke({ target: "count", input: { n: 2, delayMs: 1 } });
    const [ea, eb] = await Promise.all([collect(a), collect(b)]);
    expect(ea.every((e) => e.callId === a.ctx.callId)).toBe(true);
    expect(eb.every((e) => e.callId === b.ctx.callId)).toBe(true);
    expect(chunks(ea)).toEqual([1, 2, 3]);
    expect(chunks(eb)).toEqual([1, 2]);
  });
});

describe("ctx", () => {
  test("a root call is its own root, on a new thread", () => {
    const { core } = setup();
    expect(core.invoke({ target: "count", input: { n: 0 } }).ctx).toEqual({
      callId: "id1",
      parentId: null,
      rootId: "id1",
      threadId: "id2",
    });
  });

  test("a root call keeps the thread it asks for", () => {
    const { core } = setup();
    const call = core.invoke({ target: "count", input: { n: 0 }, threadId: "t9" });
    expect(call.ctx.threadId).toBe("t9");
  });

  test("a child call inherits the root and thread of its parent", async () => {
    const { core } = setup();
    let child: Event[] = [];
    core.registry.register(
      defineOp({
        name: "parent",
        description: "Call count and return its result.",
        input: z.object({}),
        output: z.object({ count: z.number() }),
        async run(_input, cx) {
          const call = cx.invoke("count", { n: 2 });
          child = await collect(call);
          const outcome = await call.outcome;
          return outcome.ok ? ok(outcome.value as { count: number }) : outcome;
        },
      }),
    );
    const parent = core.invoke({ target: "parent", input: {}, threadId: "t1" });

    expect(await parent.outcome).toEqual({ ok: true, value: { count: 2 } });
    expect(child[0]).toMatchObject({
      parentId: parent.ctx.callId,
      rootId: parent.ctx.callId,
      threadId: "t1",
    });
    // The parent's stream has only the parent's events.
    expect(kinds(await collect(parent))).toEqual(["call.started", "call.finished"]);
  });

  test("a call with parentId inherits from a call in the journal", async () => {
    const { core } = setup();
    const parent = core.invoke({ target: "count", input: { n: 0 }, threadId: "t1" });
    const child = core.invoke({ target: "count", input: { n: 0 }, parentId: parent.ctx.callId });
    expect(child.ctx).toMatchObject({ parentId: parent.ctx.callId, rootId: parent.ctx.callId });
    expect(child.ctx.threadId).toBe("t1");
    expect((await child.outcome).ok).toBe(true);
  });

  test("an unknown parent is invalid input", async () => {
    const { core } = setup();
    const call = core.invoke({ target: "count", input: { n: 1 }, parentId: "ghost" });
    expect(errorOf(await call.outcome)).toMatchObject({
      code: "invalid_input",
      message: "unknown parent call: ghost",
    });
    expect(kinds(await collect(call))).toEqual(["call.started", "call.finished"]);
  });

  test("a child on another thread than its parent is invalid input", async () => {
    const { core } = setup();
    const parent = core.invoke({ target: "count", input: { n: 0 }, threadId: "t1" });
    const call = core.invoke({
      target: "count",
      input: { n: 0 },
      parentId: parent.ctx.callId,
      threadId: "t2",
    });
    expect(call.ctx.threadId).toBe("t1");
    expect(errorOf(await call.outcome)?.code).toBe("invalid_input");
  });
});

describe("errors are outcomes", () => {
  test("invalid input: no progress, invalid_argument", async () => {
    const { core } = setup();
    const call = core.invoke({ target: "count", input: { n: -1 } });
    expect(kinds(await collect(call))).toEqual(["call.started", "call.finished"]);
    expect(errorOf(await call.outcome)).toMatchObject({
      category: "invalid_argument",
      code: "invalid_input",
    });
  });

  test("the op receives the parsed input, with defaults", async () => {
    const { core } = setup();
    core.registry.register(echo);
    const call = core.invoke({ target: "echo", input: { text: "hi" } });
    expect(await call.outcome).toEqual({ ok: true, value: { text: "hi", times: 1 } });
  });

  test("no executor: unavailable", async () => {
    const { core } = setup();
    const call = core.invoke({ target: "missing", input: {} });
    expect(errorOf(await call.outcome)).toEqual({
      category: "unavailable",
      code: "no_executor",
      message: "no executor for op: missing",
    });
  });

  test("an error value from the op passes through", async () => {
    const { core } = setup();
    core.registry.register(
      defineOp({
        name: "nope",
        description: "Always fails.",
        input: z.unknown(),
        output: z.unknown(),
        run: async () => fail("not_found", "file_missing", "no such file: a.ts"),
      }),
    );
    const call = core.invoke({ target: "nope", input: null });
    expect(errorOf(await call.outcome)).toEqual({
      category: "not_found",
      code: "file_missing",
      message: "no such file: a.ts",
    });
  });

  test("an output that does not match the schema: invalid_output", async () => {
    const { core } = setup();
    core.registry.register(
      defineOp({
        name: "liar",
        description: "Returns the wrong shape.",
        input: z.unknown(),
        output: z.object({ n: z.number() }),
        run: async () => ok({ n: "one" } as unknown as { n: number }),
      }),
    );
    const outcome = await core.invoke({ target: "liar", input: null }).outcome;
    expect(errorOf(outcome)).toMatchObject({ category: "internal", code: "invalid_output" });
  });

  test("a malformed result: invalid_output", async () => {
    const { core } = setup();
    core.registry.register(
      defineOp({
        name: "broken",
        description: "Returns no Result.",
        input: z.unknown(),
        output: z.unknown(),
        run: async () => undefined as never,
      }),
    );
    const outcome = await core.invoke({ target: "broken", input: null }).outcome;
    expect(errorOf(outcome)?.code).toBe("invalid_output");
  });

  test.each([
    [
      "async function",
      async () => {
        throw new Error("boom");
      },
    ],
    [
      "sync throw",
      (() => {
        throw new Error("boom");
      }) as () => never,
    ],
  ])("a thrown error (%s): exception", async (_label, run) => {
    const { core } = setup();
    core.registry.register(
      defineOp({ name: "thrower", description: "", input: z.unknown(), output: z.unknown(), run }),
    );
    const outcome = await core.invoke({ target: "thrower", input: null }).outcome;
    expect(errorOf(outcome)).toEqual({ category: "internal", code: "exception", message: "boom" });
  });

  test("a generator that throws keeps the chunks it yielded", async () => {
    const { core } = setup();
    core.registry.register(
      defineOp({
        name: "half",
        description: "Yields once, then throws.",
        input: z.unknown(),
        output: z.unknown(),
        async *run() {
          yield "a";
          throw new Error("boom");
        },
      }),
    );
    const call = core.invoke({ target: "half", input: null });
    const events = await collect(call);
    expect(chunks(events)).toEqual(["a"]);
    expect(errorOf(await call.outcome)?.code).toBe("exception");
  });
});

describe("cancellation", () => {
  test("the invoke signal reaches the op", async () => {
    const { core } = setup();
    const ctl = new AbortController();
    const call = core.invoke({ target: "count", input: { n: 1000, delayMs: 5 } }, ctl);
    const first = await collect(call, 2);
    ctl.abort();
    expect(kinds(first)).toEqual(["call.started", "call.progress"]);
    expect(errorOf(await call.outcome)?.category).toBe("canceled");
  });

  test("aborting a parent aborts its children", async () => {
    const { core } = setup();
    const ctl = new AbortController();
    let child: Promise<Outcome> | undefined;
    core.registry.register(
      defineOp({
        name: "parent",
        description: "Run a long count.",
        input: z.unknown(),
        output: z.unknown(),
        async run(_input, cx) {
          const call = cx.invoke("count", { n: 1000, delayMs: 5 });
          child = call.outcome;
          return await call.outcome;
        },
      }),
    );
    const parent = core.invoke({ target: "parent", input: null }, ctl);
    setTimeout(() => ctl.abort(), 15);
    expect(errorOf(await parent.outcome)?.category).toBe("canceled");
    expect(errorOf(await (child as Promise<Outcome>))?.category).toBe("canceled");
  });
});
