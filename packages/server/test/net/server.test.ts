import { afterEach, expect, test } from "bun:test";
import { connectWebSocket } from "@fxrt/protocol";
import { serve } from "../../src/net/server.ts";
import { setup } from "../core/helpers.ts";
import { client, until } from "./helpers.ts";

let server: ReturnType<typeof serve> | undefined;
afterEach(async () => {
  await server?.stop(true);
  server = undefined;
});

function start() {
  const { core, journal } = setup();
  server = serve(core, { hostname: "127.0.0.1", port: 0 });
  return { core, journal, url: `ws://127.0.0.1:${server.port}` };
}

test("invoke and follow a call over a real WebSocket", async () => {
  const { url } = start();
  const c = client(await connectWebSocket(url));

  const r = await c.peer.request("invoke", { target: "count", input: { n: 3 } });
  if (!r.ok) throw new Error(r.error.message);
  await c.peer.request("subscribe", {
    subscriptionId: "s1",
    from: r.value.pos,
    rootId: r.value.ctx.rootId,
  });

  await until(() => c.of("s1").at(-1)?.kind === "call.finished");
  const events = c.of("s1");
  expect(events.map((e) => e.kind)).toEqual([
    "call.started",
    "call.progress",
    "call.progress",
    "call.progress",
    "call.finished",
  ]);
  expect(events.at(-1)).toMatchObject({ outcome: { ok: true, value: { count: 3 } } });
  c.peer.close();
});

test("a client disconnect is seen by the server, and the call finishes", async () => {
  const { url, journal } = start();
  const c = client(await connectWebSocket(url));
  const r = await c.peer.request("invoke", { target: "count", input: { n: 2, delayMs: 5 } });
  if (!r.ok) throw new Error(r.error.message);
  c.peer.close();
  await until(() => journal.call(r.value.ctx.callId)?.finished != null);
});

test("the server closing resolves pending requests on the client", async () => {
  const { url } = start();
  const c = client(await connectWebSocket(url));
  const closed = new Promise<void>((resolve) => c.peer.onClose(resolve));
  await server?.stop(true);
  await closed;
  const r = await c.peer.request("invoke", { target: "count", input: { n: 0 } });
  expect(r.ok).toBe(false);
});

test("a plain HTTP request gets 426", async () => {
  start();
  const res = await fetch(`http://127.0.0.1:${server?.port}/`);
  expect(res.status).toBe(426);
  expect(res.headers.get("upgrade")).toBe("websocket");
});

test("connecting to a closed port rejects", async () => {
  const { url } = start();
  await server?.stop(true);
  server = undefined;
  await expect(connectWebSocket(url)).rejects.toThrow("connect failed");
});
