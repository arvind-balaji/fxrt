import { z } from "zod";

/**
 * Errors are values with a code and a message. The set of codes is open:
 * these are the codes the M1 core produces.
 */
export const ErrorCode = {
  /** The input does not match the op's input schema. */
  InvalidInput: "invalid_input",
  /** The op's result does not match its output schema. */
  InvalidOutput: "invalid_output",
  /** No connection serves the target op. */
  NoExecutor: "no_executor",
  /** `cancel` stopped the call or one of its ancestors. */
  Cancelled: "cancelled",
  /** The connection that ran the call was lost. */
  Interrupted: "interrupted",
  /** The call passed its deadline. */
  Timeout: "timeout",
  /** The call used up its step limit. */
  StepLimit: "step_limit",
  /** A root call is already running on the thread. */
  ThreadBusy: "thread_busy",
  /** The op failed in a way it did not report as a value. */
  Internal: "internal",
} as const;

export const CallError = z.object({
  code: z.string().min(1),
  message: z.string(),
});
export type CallError = z.infer<typeof CallError>;

export const Outcome = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), error: CallError }),
]);
export type Outcome = z.infer<typeof Outcome>;
