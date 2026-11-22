import { z } from "zod";
import { defineOp, fail, ok } from "../core/op.ts";

export const count = defineOp({
  name: "count",
  description: "Count from 1 to n, one progress chunk per number.",
  input: z.object({
    n: z.number().int().min(0).max(10_000),
    delayMs: z.number().int().min(0).max(60_000).default(0),
  }),
  output: z.object({ count: z.number().int() }),
  async *run({ n, delayMs }, { signal }) {
    for (let i = 1; i <= n; i++) {
      if (delayMs > 0 && !(await sleep(delayMs, signal))) break;
      if (signal.aborted) break;
      yield i;
    }
    if (signal.aborted) return fail("canceled", "canceled", "count canceled");
    return ok({ count: n });
  },
});

/** Resolves false if `signal` aborts first. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
