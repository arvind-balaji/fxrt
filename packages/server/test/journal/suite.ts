// Shared Journal contract. Each implementation calls journalSuite from its own test file.
import { afterEach, describe, expect, test } from "bun:test";
import { Event, type EventDraft } from "@fxrt/protocol";
import { type Journal, JournalError } from "../../src/journal/journal.ts";

export type MakeJournal = (opts: { now: () => number }) => Journal;

const ctx = { callId: "c1", parentId: null, rootId: "c1", threadId: "t1" };

const started = (over: Partial<EventDraft> = {}): EventDraft =>
  ({ kind: "call.started", ...ctx, target: "count", input: { n: 2 }, ...over }) as EventDraft;
const progress = (chunk: unknown, callId = "c1"): EventDraft => ({
  kind: "call.progress",
  ...ctx,
  callId,
  chunk,
});
const finished = (callId = "c1"): EventDraft => ({
  kind: "call.finished",
  ...ctx,
  callId,
  outcome: { ok: true, value: { count: 2 } },
});

export function journalSuite(name: string, make: MakeJournal): void {
  describe(`Journal: ${name}`, () => {
    let clock = 1000;
    let journal: Journal;
    const open = () => {
      clock = 1000;
      journal = make({ now: () => clock++ });
      return journal;
    };
    afterEach(() => journal?.close());

    describe("log", () => {
      test("starts empty", () => {
        const j = open();
        expect(j.head()).toBe(0);
        expect(j.read(1)).toEqual([]);
      });

      test("append sets pos from 1 and ts from the clock", () => {
        const j = open();
        const a = j.append(started());
        const b = j.append(progress(1));
        expect([a.pos, a.ts, b.pos, b.ts]).toEqual([1, 1000, 2, 1001]);
        expect(j.head()).toBe(2);
      });

      test("append returns the stored event", () => {
        const j = open();
        const event = j.append(started());
        expect(event).toEqual({ ...started(), pos: 1, ts: 1000 } as Event);
        expect(j.read(1)).toEqual([event]);
      });

      test("events match the protocol schema", () => {
        const j = open();
        j.append(started());
        j.append(progress("x"));
        j.append(finished());
        for (const event of j.read(1)) expect(Event.safeParse(event).success).toBe(true);
      });

      test("read starts at a position, inclusive, in log order", () => {
        const j = open();
        j.append(started());
        for (const n of [1, 2, 3]) j.append(progress(n));
        expect(j.read(3).map((e) => e.pos)).toEqual([3, 4]);
        expect(j.read(5)).toEqual([]);
      });

      test("read returns at most limit events", () => {
        const j = open();
        j.append(started());
        for (const n of [1, 2, 3]) j.append(progress(n));
        expect(j.read(2, 2).map((e) => e.pos)).toEqual([2, 3]);
      });
    });

    describe("storage", () => {
      test("stores a copy: changing the draft or a result does not change the log", () => {
        const j = open();
        const draft = started({ input: { n: 2 } } as Partial<EventDraft>);
        const returned = j.append(draft);
        (draft as { input: { n: number } }).input.n = 99;
        (returned as { input: { n: number } }).input.n = 98;
        const [read] = j.read(1);
        (read as { input: { n: number } }).input.n = 97;
        expect(j.read(1)[0]).toMatchObject({ input: { n: 2 } });
        expect(j.call("c1")?.input).toEqual({ n: 2 });
      });

      test("values go through JSON", () => {
        const j = open();
        j.append(started());
        const date = new Date(0);
        j.append(progress({ date, gone: undefined, list: [1, undefined] }));
        expect(j.read(2)[0]).toMatchObject({
          chunk: { date: date.toISOString(), list: [1, null] },
        });
        expect(j.read(2)[0]).not.toHaveProperty("chunk.gone");
      });

      test("append returns the event as read returns it, after JSON", () => {
        const j = open();
        j.append(started());
        const returned = j.append(progress({ date: new Date(0), gone: undefined }));
        expect(returned).toEqual(j.read(2)[0] as typeof returned);
        expect(returned).toMatchObject({ chunk: { date: new Date(0).toISOString() } });
        expect(returned).not.toHaveProperty("chunk.gone");
      });
    });

    describe("calls table", () => {
      test("unknown call is undefined", () => {
        expect(open().call("nope")).toBeUndefined();
      });

      test("call.started adds a running row", () => {
        const j = open();
        j.append(started());
        expect(j.call("c1")).toEqual({
          ...ctx,
          target: "count",
          input: { n: 2 },
          started: { pos: 1, ts: 1000 },
          finished: null,
        });
      });

      test("call.progress does not change the row", () => {
        const j = open();
        j.append(started());
        const before = j.call("c1");
        j.append(progress(1));
        expect(j.call("c1")).toEqual(before);
      });

      test("call.finished records the outcome", () => {
        const j = open();
        j.append(started());
        j.append(progress(1));
        j.append(finished());
        expect(j.call("c1")?.finished).toEqual({
          pos: 3,
          ts: 1002,
          outcome: { ok: true, value: { count: 2 } },
        });
      });

      test("keeps the IDs of a child call", () => {
        const j = open();
        j.append(started());
        j.append(started({ callId: "c2", parentId: "c1" }));
        expect(j.call("c2")).toMatchObject({ callId: "c2", parentId: "c1", rootId: "c1" });
      });
    });

    describe("invariants", () => {
      const rejects = (setup: EventDraft[], bad: EventDraft) => {
        const j = open();
        for (const d of setup) j.append(d);
        const head = j.head();
        const row = j.call(bad.callId);
        expect(() => j.append(bad)).toThrow(JournalError);
        expect(j.head()).toBe(head);
        expect(j.call(bad.callId)).toEqual(row);
      };

      test("rejects a second call.started", () => rejects([started()], started()));
      test("rejects progress for an unknown call", () => rejects([], progress(1)));
      test("rejects finish for an unknown call", () => rejects([], finished()));
      test("rejects progress after finish", () => rejects([started(), finished()], progress(1)));
      test("rejects a second finish", () => rejects([started(), finished()], finished()));

      test("positions stay dense after a rejected append", () => {
        const j = open();
        j.append(started());
        expect(() => j.append(started())).toThrow(JournalError);
        expect(j.append(progress(1)).pos).toBe(2);
      });
    });
  });
}
