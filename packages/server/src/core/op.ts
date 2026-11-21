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

/** What an executor returns: a value, or an error as a value. */
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

/** What the core gives an executor besides the input. */
export interface ExecContext {
  ctx: Ctx;
  /** Aborts when the call is canceled. Pass it to anything the op waits on. */
  signal: AbortSignal;
  /** Start a child call. The child gets this call as its parent, root, and thread. */
  invoke(target: OpName, input: unknown): CallStream;
}

/**
 * A primitive op runs as one of:
 * - an async function that returns a Result
 * - an async generator that yields progress chunks and returns a Result
 * Ops never make events: the core turns chunks and results into events.
 */
export type Execution<Out> = Promise<Result<Out>> | AsyncGenerator<unknown, Result<Out>, undefined>;

export interface OpDef<In extends z.ZodType = z.ZodType, Out extends z.ZodType = z.ZodType> {
  name: OpName;
  description: string;
  input: In;
  output: Out;
  // Method syntax, so a specific OpDef is assignable to the default OpDef.
  run(input: z.output<In>, cx: ExecContext): Execution<z.input<Out>>;
}

/** Identity function that infers the input and output types from the schemas. */
export function defineOp<In extends z.ZodType, Out extends z.ZodType>(
  def: OpDef<In, Out>,
): OpDef<In, Out> {
  return def;
}
