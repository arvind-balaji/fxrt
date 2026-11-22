import { describe, expect, test } from "bun:test";
import { defineApi, Peer, RPC_ERRORS, RpcException, type Socket, socketPair } from "@fxrt/protocol";
import { z } from "zod";

const MathApi = defineApi({
  methods: {
    add: { params: z.object({ a: z.number(), b: z.number() }), result: z.number() },
    slow: { params: z.object({ ms: z.number() }), result: z.string() },
    fail: { params: z.object({ code: z.number().optional() }), result: z.null() },
    wrong: { params: z.object({}), result: z.number() },
  },
  notifications: { log: z.object({ line: z.string() }) },
});

const EchoApi = defineApi({
  methods: { echo: { params: z.string(), result: z.string() } },
  notifications: {},
});

const tick = () => new Promise((r) => setTimeout(r, 0));

/** `math` serves MathApi and calls EchoApi; `echo` is the reverse. */
function connect() {
  const [a, b] = socketPair();
  const math = new Peer(a, { local: MathApi, remote: EchoApi });
  const echo = new Peer(b, { local: EchoApi, remote: MathApi });
  math.handle("add", ({ a, b }) => a + b);
  math.handle("slow", async ({ ms }) => {
    await new Promise((r) => setTimeout(r, ms));
    return `slept ${ms}`;
  });
  math.handle("fail", ({ code }) => {
    if (code !== undefined) throw new RpcException(code, "custom", { why: "test" });
    throw new Error("boom");
  });
  math.handle("wrong", () => "not a number" as unknown as number);
  echo.handle("echo", (s) => s);
  return { math, echo, sockets: [a, b] as const };
}

/** A peer on one end, raw frames on the other. */
function raw() {
  const [a, b] = socketPair();
  const peer = new Peer(a, { local: MathApi, remote: EchoApi });
  peer.handle("add", ({ a, b }) => a + b);
  const frames: unknown[] = [];
  b.onMessage((data) => frames.push(JSON.parse(data)));
  return { peer, socket: b as Socket, frames };
}

describe("requests", () => {
  test("round trip", async () => {
    const { echo } = connect();
    expect(await echo.request("add", { a: 2, b: 3 })).toEqual({ ok: true, value: 5 });
  });

  test("both ends send requests on one connection", async () => {
    const { math, echo } = connect();
    const [sum, word] = await Promise.all([
      echo.request("add", { a: 1, b: 1 }),
      math.request("echo", "hi"),
    ]);
    expect(sum).toEqual({ ok: true, value: 2 });
    expect(word).toEqual({ ok: true, value: "hi" });
  });

  test("responses match requests by id, in any order", async () => {
    const { echo } = connect();
    const slow = echo.request("slow", { ms: 10 });
    const fast = echo.request("add", { a: 1, b: 2 });
    expect(await fast).toEqual({ ok: true, value: 3 });
    expect(await slow).toEqual({ ok: true, value: "slept 10" });
  });
});

describe("errors are values", () => {
  test("invalid params", async () => {
    const { echo } = connect();
    const r = await echo.request("add", { a: 1 } as never);
    expect(r).toMatchObject({ ok: false, error: { code: RPC_ERRORS.invalid_params } });
  });

  test("a method with no handler", async () => {
    const [a, b] = socketPair();
    new Peer(a, { local: MathApi, remote: EchoApi });
    const caller = new Peer(b, { local: EchoApi, remote: MathApi });
    expect(await caller.request("add", { a: 1, b: 2 })).toEqual({
      ok: false,
      error: { code: RPC_ERRORS.method_not_found, message: "method not found: add" },
    });
  });

  test("a handler that throws", async () => {
    const { echo } = connect();
    expect(await echo.request("fail", {})).toEqual({
      ok: false,
      error: { code: RPC_ERRORS.internal_error, message: "boom" },
    });
  });

  test("a handler that throws RpcException sets the code and data", async () => {
    const { echo } = connect();
    expect(await echo.request("fail", { code: 42 })).toEqual({
      ok: false,
      error: { code: 42, message: "custom", data: { why: "test" } },
    });
  });

  test("a result that does not match the schema", async () => {
    const { echo } = connect();
    const r = await echo.request("wrong", {});
    expect(r).toMatchObject({ ok: false, error: { code: RPC_ERRORS.invalid_result } });
  });
});

describe("notifications", () => {
  test("reach the listener", async () => {
    const { math, echo } = connect();
    const lines: string[] = [];
    math.on("log", ({ line }) => lines.push(line));
    echo.notify("log", { line: "a" });
    echo.notify("log", { line: "b" });
    await tick();
    expect(lines).toEqual(["a", "b"]);
  });

  test("with invalid params are dropped", async () => {
    const { math, echo } = connect();
    const lines: string[] = [];
    math.on("log", ({ line }) => lines.push(line));
    echo.notify("log", { line: 1 } as never);
    echo.notify("log", { line: "ok" });
    await tick();
    expect(lines).toEqual(["ok"]);
  });
});

describe("close", () => {
  test("resolves pending requests with connection_closed", async () => {
    const { echo, math } = connect();
    const pending = echo.request("slow", { ms: 50 });
    await tick();
    math.close();
    expect(await pending).toEqual({
      ok: false,
      error: { code: RPC_ERRORS.connection_closed, message: "connection closed" },
    });
  });

  test("both ends see it", async () => {
    const { echo, math } = connect();
    const seen: string[] = [];
    math.onClose(() => seen.push("math"));
    echo.onClose(() => seen.push("echo"));
    echo.close();
    await tick();
    expect(seen.sort()).toEqual(["echo", "math"]);
    expect([math.closed, echo.closed]).toEqual([true, true]);
  });

  test("requests after close fail at once", async () => {
    const { echo } = connect();
    echo.close();
    const r = await echo.request("add", { a: 1, b: 2 });
    expect(r).toMatchObject({ ok: false, error: { code: RPC_ERRORS.connection_closed } });
  });

  test("onClose after close runs the listener at once", () => {
    const { echo } = connect();
    echo.close();
    let ran = false;
    echo.onClose(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

describe("malformed frames", () => {
  test("not JSON: parse_error with a null id", async () => {
    const { socket, frames } = raw();
    socket.send("{nope");
    await tick();
    expect(frames).toMatchObject([{ id: null, error: { code: RPC_ERRORS.parse_error } }]);
  });

  test.each([["[]"], ["42"], ["null"]])("not an object (%s): invalid_request", async (frame) => {
    const { socket, frames } = raw();
    socket.send(frame);
    await tick();
    expect(frames).toMatchObject([{ id: null, error: { code: RPC_ERRORS.invalid_request } }]);
  });

  test("a bad request keeps its id when it has one", async () => {
    const { socket, frames } = raw();
    socket.send(JSON.stringify({ jsonrpc: "1.0", id: 7, method: "add" }));
    await tick();
    expect(frames).toMatchObject([{ id: 7, error: { code: RPC_ERRORS.invalid_request } }]);
  });

  test("a method name from Object.prototype is not found", async () => {
    const { socket, frames } = raw();
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "toString" }));
    await tick();
    expect(frames).toMatchObject([{ id: 1, error: { code: RPC_ERRORS.method_not_found } }]);
  });

  test("a response for an unknown id is ignored", async () => {
    const { peer, socket, frames } = raw();
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 99, result: 1 }));
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "add", params: { a: 1, b: 1 } }));
    await tick();
    expect(frames).toEqual([{ jsonrpc: "2.0", id: 1, result: 2 }]);
    expect(peer.closed).toBe(false);
  });
});
