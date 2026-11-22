import { describe, expect, test } from "bun:test";
import { RPC_ERRORS, socketPair } from "@fxrt/protocol";
import { z } from "zod";
import { defineOp } from "../../src/core/op.ts";
import { Connection } from "../../src/net/connection.ts";
import { setup } from "../core/helpers.ts";
import { client, settle, until } from "./helpers.ts";

function connect(core = setup().core) {
  const [s, c] = socketPair();
  const conn = new Connection(core, s);
  return { conn, ...client(c) };
}

/** Starts a child count, then returns its outcome. */
const parent = defineOp({
  name: "parent",
  description: "",
  input: z.object({}),
  output: z.unknown(),
  run: (_input, cx) => cx.invoke("count", { n: 1 }).outcome,
});

describe("invoke", () => {
  test("returns ctx and the position of call.started", async () => {
    const { core, journal } = setup();
    const { peer } = connect(core);
    const r = await peer.request("invoke", { target: "count", input: { n: 1 } });
    if (!r.ok) throw new Error(r.error.message);
    expect(journal.read(r.value.pos)[0]).toMatchObject({ kind: "call.started", ...r.value.ctx });
  });

  test("a malformed request is a transport error and is not journaled", async () => {
    const { core, journal } = setup();
    const { peer } = connect(core);
    const r = await peer.request("invoke", { target: "Bad Name", input: null });
    expect(r).toMatchObject({ ok: false, error: { code: RPC_ERRORS.invalid_params } });
    expect(journal.head()).toBe(0);
  });

  test("the call keeps running after the client disconnects", async () => {
    const { core, journal } = setup();
    const { peer } = connect(core);
    const r = await peer.request("invoke", { target: "count", input: { n: 3, delayMs: 5 } });
    if (!r.ok) throw new Error(r.error.message);
    peer.close();
    await until(() => journal.call(r.value.ctx.callId)?.finished != null);
    expect(journal.call(r.value.ctx.callId)?.finished?.outcome).toEqual({
      ok: true,
      value: { count: 3 },
    });
  });
});

describe("subscribe", () => {
  test("from a position: the backlog, then new events", async () => {
    const { core } = setup();
    await core.invoke({ target: "count", input: { n: 2 } }).outcome;
    const c = connect(core);
    await c.peer.request("subscribe", { subscriptionId: "s1", from: 1 });
    await until(() => c.of("s1").length === 4);
    await core.invoke({ target: "count", input: { n: 1 } }).outcome;
    await until(() => c.of("s1").length === 7);
    expect(c.of("s1").map((e) => e.pos)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("without a position: only new events", async () => {
    const { core } = setup();
    await core.invoke({ target: "count", input: { n: 2 } }).outcome;
    const c = connect(core);
    await c.peer.request("subscribe", { subscriptionId: "s1" });
    await core.invoke({ target: "count", input: { n: 0 } }).outcome;
    await until(() => c.of("s1").length === 2);
    expect(c.of("s1").map((e) => e.pos)).toEqual([5, 6]);
  });

  test("filters by root: the root call and its children only", async () => {
    const { core } = setup();
    core.registry.register(parent);
    const c = connect(core);
    const root = core.invoke({ target: "parent", input: {} });
    core.invoke({ target: "count", input: { n: 2 } });
    await c.peer.request("subscribe", { subscriptionId: "s1", from: 1, rootId: root.ctx.callId });
    await root.outcome;
    await settle();
    const events = c.of("s1");
    expect(events.every((e) => e.rootId === root.ctx.callId)).toBe(true);
    // parent: started, finished; child: started, progress, finished
    expect(events).toHaveLength(5);
    expect(new Set(events.map((e) => e.callId)).size).toBe(2);
  });

  test("filters by thread", async () => {
    const { core } = setup();
    const c = connect(core);
    await c.peer.request("subscribe", { subscriptionId: "s1", from: 1, threadId: "t1" });
    await core.invoke({ target: "count", input: { n: 1 }, threadId: "t1" }).outcome;
    await core.invoke({ target: "count", input: { n: 1 }, threadId: "t2" }).outcome;
    await settle();
    expect(c.of("s1")).toHaveLength(3);
    expect(c.of("s1").every((e) => e.threadId === "t1")).toBe(true);
  });

  test("subscriptions on one connection are separate", async () => {
    const { core } = setup();
    const c = connect(core);
    const a = core.invoke({ target: "count", input: { n: 1 }, threadId: "ta" });
    const b = core.invoke({ target: "count", input: { n: 2 }, threadId: "tb" });
    await c.peer.request("subscribe", { subscriptionId: "a", from: 1, threadId: "ta" });
    await c.peer.request("subscribe", { subscriptionId: "b", from: 1, threadId: "tb" });
    await Promise.all([a.outcome, b.outcome]);
    await until(() => c.of("a").length === 3 && c.of("b").length === 4);
  });

  test("a duplicate ID on the same connection is rejected", async () => {
    const { core } = setup();
    const c = connect(core);
    await c.peer.request("subscribe", { subscriptionId: "s1" });
    const r = await c.peer.request("subscribe", { subscriptionId: "s1" });
    expect(r).toEqual({
      ok: false,
      error: { code: RPC_ERRORS.invalid_params, message: "subscription already exists: s1" },
    });
    expect(c.conn.subscriptionCount).toBe(1);
  });

  test("the same ID on two connections is fine", async () => {
    const { core } = setup();
    const one = connect(core);
    const two = connect(core);
    expect((await one.peer.request("subscribe", { subscriptionId: "s1" })).ok).toBe(true);
    expect((await two.peer.request("subscribe", { subscriptionId: "s1" })).ok).toBe(true);
    await core.invoke({ target: "count", input: { n: 0 } }).outcome;
    await until(() => one.of("s1").length === 2 && two.of("s1").length === 2);
  });
});

describe("unsubscribe", () => {
  test("stops delivery", async () => {
    const { core } = setup();
    const c = connect(core);
    await c.peer.request("subscribe", { subscriptionId: "s1" });
    await core.invoke({ target: "count", input: { n: 0 } }).outcome;
    await until(() => c.of("s1").length === 2);
    expect(await c.peer.request("unsubscribe", { subscriptionId: "s1" })).toEqual({
      ok: true,
      value: {},
    });
    await core.invoke({ target: "count", input: { n: 0 } }).outcome;
    await settle();
    expect(c.of("s1")).toHaveLength(2);
    expect(c.conn.subscriptionCount).toBe(0);
  });

  test("an unknown ID is not an error", async () => {
    const c = connect();
    expect((await c.peer.request("unsubscribe", { subscriptionId: "nope" })).ok).toBe(true);
  });

  test("frees the ID for reuse", async () => {
    const c = connect();
    await c.peer.request("subscribe", { subscriptionId: "s1" });
    await c.peer.request("unsubscribe", { subscriptionId: "s1" });
    expect((await c.peer.request("subscribe", { subscriptionId: "s1" })).ok).toBe(true);
  });
});

test("closing the connection ends its subscriptions", async () => {
  const { core } = setup();
  const c = connect(core);
  await c.peer.request("subscribe", { subscriptionId: "s1" });
  await c.peer.request("subscribe", { subscriptionId: "s2" });
  expect(c.conn.subscriptionCount).toBe(2);
  c.peer.close();
  await settle();
  expect(c.conn.subscriptionCount).toBe(0);
  // The core still works for everyone else.
  expect((await core.invoke({ target: "count", input: { n: 1 } }).outcome).ok).toBe(true);
});
