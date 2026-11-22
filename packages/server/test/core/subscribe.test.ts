import { expect, test } from "bun:test";
import { chunks, collect, kinds, setup } from "./helpers.ts";

test("subscribe from 1 replays the whole log", async () => {
  const { core, journal } = setup();
  await core.invoke({ target: "count", input: { n: 2 } }).outcome;
  const events = await collect(core.subscribe(1), journal.head());
  expect(events).toEqual(journal.read(1));
});

test("subscribe from a position starts there", async () => {
  const { core } = setup();
  await core.invoke({ target: "count", input: { n: 3 } }).outcome;
  const events = await collect(core.subscribe(3), 3);
  expect(events.map((e) => e.pos)).toEqual([3, 4, 5]);
  expect(chunks(events)).toEqual([2, 3]);
});

test("subscribe replays the backlog, then follows new events", async () => {
  const { core } = setup();
  await core.invoke({ target: "count", input: { n: 1 } }).outcome;
  const sub = collect(core.subscribe(1), 3 + 4);
  core.invoke({ target: "count", input: { n: 2, delayMs: 1 } });
  const events = await sub;
  expect(events.map((e) => e.pos)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test("subscribe with no position gets only new events", async () => {
  const { core } = setup();
  await core.invoke({ target: "count", input: { n: 2 } }).outcome;
  const sub = collect(core.subscribe(), 3);
  const call = core.invoke({ target: "count", input: { n: 1 } });
  const events = await sub;
  expect(kinds(events)).toEqual(["call.started", "call.progress", "call.finished"]);
  expect(events.every((e) => e.callId === call.ctx.callId)).toBe(true);
});

test("subscribe sees events of all calls, in log order", async () => {
  const { core } = setup();
  const sub = collect(core.subscribe(1), 6);
  const a = core.invoke({ target: "count", input: { n: 1, delayMs: 1 } });
  const b = core.invoke({ target: "count", input: { n: 1, delayMs: 1 } });
  const events = await sub;
  expect(events.map((e) => e.pos)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(new Set(events.map((e) => e.callId))).toEqual(new Set([a.ctx.callId, b.ctx.callId]));
});

test("aborting the signal ends a waiting subscription", async () => {
  const { core } = setup();
  const ctl = new AbortController();
  const sub = collect(core.subscribe(1, ctl));
  setTimeout(() => ctl.abort(), 5);
  expect(await sub).toEqual([]);
});
