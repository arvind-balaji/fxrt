import { expect, test } from "bun:test";
import type { Socket } from "@fxrt/protocol";

test("workspace package resolves", () => {
  const sent: string[] = [];
  const socket: Socket = {
    send: (data) => sent.push(data),
    onMessage: () => {},
    onClose: () => {},
    close: () => {},
  };
  socket.send("ping");
  expect(sent).toEqual(["ping"]);
});
