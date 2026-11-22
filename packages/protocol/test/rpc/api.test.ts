import { expect, test } from "bun:test";
import {
  ClientApi,
  type Event,
  Peer,
  parseEvent,
  RPC_ERRORS,
  ServerApi,
  socketPair,
  type UnknownEvent,
} from "@fxrt/protocol";

const ctx = { callId: "c1", parentId: null, rootId: "c1", threadId: "t1" };
const started: Event = {
  kind: "call.started",
  pos: 1,
  ts: 1000,
  ...ctx,
  target: "count",
  input: { n: 1 },
};

function connect() {
  const [s, c] = socketPair();
  const server = new Peer(s, { local: ServerApi, remote: ClientApi });
  const client = new Peer(c, { local: ClientApi, remote: ServerApi });
  return { server, client };
}

test("invoke returns the call's ctx and the position of call.started", async () => {
  const { server, client } = connect();
  server.handle("invoke", (req) => {
    expect(req).toEqual({ target: "count", input: { n: 1 } });
    return { ctx, pos: 1 };
  });
  expect(await client.request("invoke", { target: "count", input: { n: 1 } })).toEqual({
    ok: true,
    value: { ctx, pos: 1 },
  });
});

test("invoke rejects a bad op name before the handler runs", async () => {
  const { server, client } = connect();
  let called = false;
  server.handle("invoke", () => {
    called = true;
    return { ctx, pos: 1 };
  });
  const r = await client.request("invoke", { target: "Bad Name", input: null });
  expect(r).toMatchObject({ ok: false, error: { code: RPC_ERRORS.invalid_params } });
  expect(called).toBe(false);
});

test("events sent before the subscribe response still reach the subscription", async () => {
  const { server, client } = connect();
  const unknown: UnknownEvent = { kind: "future.kind", pos: 2, ts: 1001, extra: true };
  server.handle("subscribe", ({ subscriptionId, from }) => {
    expect(from).toBe(1);
    server.notify("event", { subscriptionId, event: started });
    server.notify("event", { subscriptionId, event: unknown });
    return {};
  });
  const got: { id: string; event: ReturnType<typeof parseEvent> }[] = [];
  client.on("event", ({ subscriptionId, event }) =>
    got.push({ id: subscriptionId, event: parseEvent(event) }),
  );

  expect(await client.request("subscribe", { subscriptionId: "s1", from: 1 })).toEqual({
    ok: true,
    value: {},
  });
  expect(got).toEqual([
    { id: "s1", event: { known: true, event: started } },
    { id: "s1", event: { known: false, event: unknown } },
  ]);
});

test("subscribe takes root and thread filters", async () => {
  const { server, client } = connect();
  server.handle("subscribe", (params) => {
    expect(params).toEqual({ subscriptionId: "s1", rootId: "c1", threadId: "t1" });
    return {};
  });
  const r = await client.request("subscribe", {
    subscriptionId: "s1",
    rootId: "c1",
    threadId: "t1",
  });
  expect(r.ok).toBe(true);
});

test("unsubscribe", async () => {
  const { server, client } = connect();
  server.handle("unsubscribe", ({ subscriptionId }) => {
    expect(subscriptionId).toBe("s1");
    return {};
  });
  expect(await client.request("unsubscribe", { subscriptionId: "s1" })).toEqual({
    ok: true,
    value: {},
  });
});
