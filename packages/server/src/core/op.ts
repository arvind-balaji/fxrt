import {
  type CallError,
  CORE_ERRORS,
  type CoreErrorCode,
  type Ctx,
  type ErrorCategory,
  type OpName,
  type Outcome,
} from "@fxrt/protocol";
import type { z } from "zod";
import type { CallStream } from "./core.ts";

export type Result<T> = { ok: true; value: T } | { ok: false; error: CallError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(category: ErrorCategory, code: string, message: string): Result<never> {
  return { ok: false, error: { category, code, message } };
}

export function coreError(code: CoreErrorCode, message: string): Outcome {
  return { ok: false, error: { category: CORE_ERRORS[code], code, message } };
}

export interface ExecContext {
  ctx: Ctx;
  signal: AbortSignal;
  invoke(target: OpName, input: unknown): CallStream;
}

/** Each value an async generator yields becomes a `call.progress` chunk. */
export type Execution<Out> = Promise<Result<Out>> | AsyncGenerator<unknown, Result<Out>, undefined>;

export interface OpDef<In extends z.ZodType = z.ZodType, Out extends z.ZodType = z.ZodType> {
  name: OpName;
  description: string;
  input: In;
  output: Out;
  // Method syntax, so a specific OpDef is assignable to the default OpDef.
  run(input: z.output<In>, cx: ExecContext): Execution<z.input<Out>>;
}

export function defineOp<In extends z.ZodType, Out extends z.ZodType>(
  def: OpDef<In, Out>,
): OpDef<In, Out> {
  return def;
}
