import { z } from "zod";

/**
 * Error categories: the gRPC canonical status codes, in the lowercase string form
 * of the Connect protocol.
 * - https://github.com/googleapis/googleapis/blob/master/google/rpc/code.proto
 * - https://connectrpc.com/docs/protocol/#error-codes
 *
 * Callers react to the category (retry, resume, display). FXRT follows gRPC here;
 * later error-detail shapes should follow google.rpc where they fit.
 */
export const ERROR_CATEGORIES = [
  "canceled",
  "unknown",
  "invalid_argument",
  "deadline_exceeded",
  "not_found",
  "already_exists",
  "permission_denied",
  "resource_exhausted",
  "failed_precondition",
  "aborted",
  "out_of_range",
  "unimplemented",
  "internal",
  "unavailable",
  "data_loss",
  "unauthenticated",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

const CATEGORY_SET: ReadonlySet<string> = new Set(ERROR_CATEGORIES);

/** The codes the core produces, with their categories. Ops choose their own codes. */
export const CORE_ERRORS = {
  /** The input does not match the op's input schema. */
  invalid_input: "invalid_argument",
  /** The op's result does not match its output schema. */
  invalid_output: "internal",
  /** No connection serves the target op. */
  no_executor: "unavailable",
  /** The op threw instead of returning an error value. */
  exception: "internal",
} as const satisfies Record<string, ErrorCategory>;
export type CoreErrorCode = keyof typeof CORE_ERRORS;

/**
 * An error is a value: a category from the fixed list, an open code with the
 * specific reason, and a message for the model and for people.
 * A category this build does not know is read as `unknown`.
 */
export const CallError = z.object({
  category: z
    .string()
    .min(1)
    .transform((c): ErrorCategory => (CATEGORY_SET.has(c) ? (c as ErrorCategory) : "unknown")),
  code: z.string().min(1),
  message: z.string(),
});
export type CallError = z.infer<typeof CallError>;

export const Outcome = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), error: CallError }),
]);
export type Outcome = z.infer<typeof Outcome>;
