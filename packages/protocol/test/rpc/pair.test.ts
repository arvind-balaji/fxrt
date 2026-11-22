import { expect, test } from "bun:test";
import { type Socket, socketPair } from "@fxrt/protocol";

function inbox(socket: Socket): string[] {
  const got: string[] = [];
  socket.onMessage((data) => got.push(data));
  return got;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("delivers in order, asynchronously, both ways", async () => {
  const [a, b] = socketPair();
  const atA = inbox(a);
  const atB = inbox(b);
  a.send("1");
  a.send("2");
  b.send("x");
  expect(atB).toEqual([]);
  await tick();
  expect(atB).toEqual(["1", "2"]);
  expect(atA).toEqual(["x"]);
});

test("close reaches both ends after messages in flight", async () => {
  const [a, b] = socketPair();
  const events: string[] = [];
  b.onMessage((data) => events.push(`msg ${data}`));
  a.onClose(() => events.push("a closed"));
  b.onClose(() => events.push("b closed"));
  a.send("last");
  a.close();
  await tick();
  expect(events).toEqual(["msg last", "a closed", "b closed"]);
});

test("send after close throws", () => {
  const [a, b] = socketPair();
  b.close();
  expect(() => a.send("x")).toThrow("socket closed");
});
