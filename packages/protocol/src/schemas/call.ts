import { z } from "zod";
import { CallId, OpName, ThreadId } from "./names.ts";

/** What a caller sends to `invoke`. The core fills in the rest of the context. */
export const CallRequest = z.object({
  target: OpName,
  input: z.unknown(),
  /** The parent call. Absent for a root call. */
  parentId: CallId.optional(),
  /** The thread for a root call. Absent: the server creates a new thread. */
  threadId: ThreadId.optional(),
});
export type CallRequest = z.infer<typeof CallRequest>;

/** The IDs the core assigns to every call. A child call carries its parent's root and thread. */
export const Ctx = z.object({
  callId: CallId,
  parentId: CallId.nullable(),
  rootId: CallId,
  threadId: ThreadId,
});
export type Ctx = z.infer<typeof Ctx>;

/** A call after the core has assigned its context. This is what an executor receives. */
export const Call = z.object({
  target: OpName,
  input: z.unknown(),
  ctx: Ctx,
});
export type Call = z.infer<typeof Call>;
