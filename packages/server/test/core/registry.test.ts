import { expect, test } from "bun:test";
import { OpSpec } from "@fxrt/protocol";
import { Registry } from "../../src/core/registry.ts";
import { count } from "../../src/ops/count.ts";

test("register and get", () => {
  const r = new Registry();
  r.register(count);
  expect(r.get("count")).toBe(count);
  expect(r.get("other")).toBeUndefined();
});

test("each op has one executor", () => {
  const r = new Registry();
  r.register(count);
  expect(() => r.register(count)).toThrow("op already registered: count");
});

test("rejects an invalid op name", () => {
  expect(() => new Registry().register({ ...count, name: "Bad-Name" })).toThrow();
});

test("unregister makes the op unavailable", () => {
  const r = new Registry();
  r.register(count);
  expect(r.unregister("count")).toBe(true);
  expect(r.get("count")).toBeUndefined();
  expect(r.unregister("count")).toBe(false);
});

test("specs give schemas as JSON Schema", () => {
  const r = new Registry();
  r.register(count);
  const [spec] = r.specs();
  expect(OpSpec.parse(spec)).toEqual(spec as OpSpec);
  expect(spec).toMatchObject({
    name: "count",
    input: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] },
    output: { type: "object", properties: { count: { type: "integer" } } },
  });
});
