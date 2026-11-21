import { z } from "zod";

/**
 * Op names are lowercase, dot-separated segments: `lm`, `fs.read`, `shell.exec`.
 * Each segment starts with a letter and may contain digits and single underscores.
 * Hyphens are not allowed, so the `lm` adapter can map `.` to `-` for model providers
 * (which allow `[a-zA-Z0-9_-]{1,64}`) and map it back without ambiguity.
 */
export const OP_NAME_PATTERN =
  /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*)*$/;
export const OP_NAME_MAX_LENGTH = 64;

export const OpName = z
  .string()
  .max(OP_NAME_MAX_LENGTH)
  .regex(OP_NAME_PATTERN, { error: "must be lowercase dot-separated segments, e.g. fs.read" });
export type OpName = z.infer<typeof OpName>;

/** IDs are opaque strings. The server creates them. */
export const CallId = z.string().min(1);
export type CallId = z.infer<typeof CallId>;

export const ThreadId = z.string().min(1);
export type ThreadId = z.infer<typeof ThreadId>;

/** A position in the global event log. Positions start at 1 and increase by 1. */
export const LogPosition = z.number().int().positive();
export type LogPosition = z.infer<typeof LogPosition>;
