import { type JsonSchema, OpName, type OpSpec } from "@fxrt/protocol";
import { z } from "zod";
import type { OpDef } from "./op.ts";

/** The ops that can run now, by name. Each op has one executor. */
export class Registry {
  readonly #ops = new Map<OpName, OpDef>();

  /** Add an op. Throws if the name is invalid or already registered. */
  register(def: OpDef): void {
    OpName.parse(def.name);
    if (this.#ops.has(def.name)) throw new Error(`op already registered: ${def.name}`);
    this.#ops.set(def.name, def);
  }

  /** Remove an op. Returns false if it was not registered. */
  unregister(name: OpName): boolean {
    return this.#ops.delete(name);
  }

  get(name: OpName): OpDef | undefined {
    return this.#ops.get(name);
  }

  /** The catalogue, with schemas as JSON Schema, as it goes on the wire. */
  specs(): OpSpec[] {
    return [...this.#ops.values()].map((op) => ({
      name: op.name,
      description: op.description,
      input: z.toJSONSchema(op.input, { io: "input" }) as JsonSchema,
      output: z.toJSONSchema(op.output, { io: "output" }) as JsonSchema,
    }));
  }
}
