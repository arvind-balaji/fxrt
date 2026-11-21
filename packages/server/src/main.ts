#!/usr/bin/env bun
// fxrtd: the server. Layout:
// - core/: invoke, registry, routing, cancellation, threads (keep small)
// - journal/: journal interface + SQLite implementation
// - ops/: lm, agent, compact (ops that run on the server)
// - net/: Bun.serve -> Socket adapter, connection lifecycle
import { getLogger } from "@logtape/logtape";
import { type Config, ConfigError, loadConfig } from "./config.ts";
import { setupLogging } from "./log.ts";

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  for (const issue of err.issues) console.error(`config ${issue}`);
  process.exit(1);
}

await setupLogging(config);
const log = getLogger(["fxrt", "server"]);
log.debug("config {sources}", { sources: config.sources });

log.info("start {host}:{port}", { host: config.host, port: config.port });
