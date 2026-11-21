import { describe, expect, test } from "bun:test";
import { CallRequest, Event, type EventDraft, OpName, Outcome, parseEvent } from "@fxrt/protocol";

const ids = { callId: "c1", parentId: null, rootId: "c1", threadId: "t1" };

describe("OpName", () => {
  test.each(["lm", "fs.read", "shell.exec", "fs.read_all", "a1.b2"])("accepts %s", (name) => {
    expect(OpName.safeParse(name).success).toBe(true);
  });

  test.each([
    "",
    "Fs.read",
    "fs-read",
    "fs..read",
    ".fs",
    "fs.",
    "1fs",
    "fs.__x",
    "fs.read_",
    "op:lm",
    "a".repeat(65),
  ])("rejects %p", (name) => {
    expect(OpName.safeParse(name).success).toBe(false);
  });
});

describe("CallRequest", () => {
  test("a root call needs only a target and input", () => {
    expect(CallRequest.parse({ target: "lm", input: { prompt: "hi" } })).toEqual({
      target: "lm",
      input: { prompt: "hi" },
    });
  });

  test("rejects an invalid target", () => {
    expect(CallRequest.safeParse({ target: "Bad Name", input: null }).success).toBe(false);
  });
});

describe("Outcome", () => {
  test("is a value or an error", () => {
    expect(Outcome.parse({ ok: true, value: 1 })).toEqual({ ok: true, value: 1 });
    const error = { code: "cancelled", message: "cancelled by c0" };
    expect(Outcome.parse({ ok: false, error })).toEqual({ ok: false, error });
    expect(Outcome.safeParse({ ok: false, value: 1 }).success).toBe(false);
  });
});

describe("Event", () => {
  test("parses each known kind", () => {
    const events = [
      { pos: 1, ts: 0, ...ids, kind: "call.started", target: "echo", input: "x" },
      { pos: 2, ts: 0, ...ids, kind: "call.progress", chunk: "x" },
      { pos: 3, ts: 0, ...ids, kind: "call.finished", outcome: { ok: true, value: "x" } },
      { pos: 4, ts: 0, ...ids, kind: "interaction.request", target: "ask", input: {} },
      { pos: 5, ts: 0, kind: "connection.lost", connectionId: "cli-1" },
    ];
    for (const e of events) expect(Event.parse(e)).toEqual(e as Event);
  });

  test("drafts keep each kind's own fields", () => {
    const draft: EventDraft = { ...ids, kind: "call.progress", chunk: "x" };
    // @ts-expect-error: call.progress has no outcome
    const bad: EventDraft = { ...ids, kind: "call.progress", outcome: { ok: true, value: 1 } };
    expect([draft, bad]).toHaveLength(2);
  });

  test("call events need their IDs", () => {
    const e = { pos: 1, ts: 0, kind: "call.progress", chunk: "x" };
    expect(Event.safeParse(e).success).toBe(false);
  });
});

describe("parseEvent", () => {
  test("passes unknown kinds through", () => {
    const e = { pos: 9, ts: 0, kind: "surface.update", tree: {} };
    expect(parseEvent(e)).toEqual({ known: false, event: e });
  });

  test("throws on a known kind with bad fields", () => {
    expect(() => parseEvent({ pos: 1, ts: 0, kind: "call.finished" })).toThrow();
  });
});
