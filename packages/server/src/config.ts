import { DEFAULT_HOST, DEFAULT_PORT } from "@fxrt/protocol";
import { z } from "zod";

// The only module in the server that reads process.env.
// Bun loads .env from the current folder before this runs.

const LOG_LEVELS = ["trace", "debug", "info", "warning", "error", "fatal"] as const;

const Env = z.object({
  FXRT_HOST: z.string().default(DEFAULT_HOST),
  FXRT_PORT: z.coerce
    .number()
    .int({ error: "must be 1-65535" })
    .min(1, { error: "must be 1-65535" })
    .max(65535, { error: "must be 1-65535" })
    .default(DEFAULT_PORT),
  FXRT_LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: `must be one of ${LOG_LEVELS.join(", ")}` })
    .default("info"),
});

type Source = "env" | "default";

export interface Config {
  host: string;
  port: number;
  logLevel: (typeof LOG_LEVELS)[number];
  sources: Record<string, Source>;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("\n"));
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat empty values as unset.
  const input = Object.fromEntries(
    Object.keys(Env.shape).flatMap((k) => (env[k] ? [[k, env[k]]] : [])),
  );
  const parsed = Env.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => {
        const key = String(i.path[0]);
        return `${key}: ${input[key] === undefined ? "required" : i.message}`;
      }),
    );
  }
  const e = parsed.data;
  return {
    host: e.FXRT_HOST,
    port: e.FXRT_PORT,
    logLevel: e.FXRT_LOG_LEVEL,
    sources: Object.fromEntries(
      Object.keys(Env.shape).map((k) => [k, k in input ? "env" : "default"]),
    ),
  };
}
