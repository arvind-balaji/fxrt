import { type JsonSchema, OpName, type OpSpec } from "@fxrt/protocol";
import { z } from "zod";
import type { OpDef } from "./op.ts";

export class Registry {
  readonly #ops = new Map<OpName, OpDef>();

  register(def: OpDef): void {
    OpName.parse(def.name);
    if (this.#ops.has(def.name)) throw new Error(`op already registered: ${def.name}`);
    this.#ops.set(def.name, def);
  }

  unregister(name: OpName): boolean {
    return this.#ops.delete(name);
  }

  get(name: OpName): OpDef | undefined {
    return this.#ops.get(name);
  }

  specs(): OpSpec[] {
    return [...this.#ops.values()].map((op) => ({
      name: op.name,
      description: op.description,
      input: z.toJSONSchema(op.input, { io: "input" }) as JsonSchema,
      output: z.toJSONSchema(op.output, { io: "output" }) as JsonSchema,
    }));
  }
}
