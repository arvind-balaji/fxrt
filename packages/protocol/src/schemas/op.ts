import { z } from "zod";
import { OpName } from "./names.ts";

/** A JSON Schema document. Schemas cross the wire as JSON Schema, not as Zod. */
export const JsonSchema = z.record(z.string(), z.unknown());
export type JsonSchema = z.infer<typeof JsonSchema>;

/** What an executor registers for each op it serves. */
export const OpSpec = z.object({
  name: OpName,
  description: z.string(),
  input: JsonSchema,
  output: JsonSchema,
});
export type OpSpec = z.infer<typeof OpSpec>;
