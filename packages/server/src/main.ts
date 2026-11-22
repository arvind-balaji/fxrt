#!/usr/bin/env bun
// fxrtd: the server. Layout:
// - core/: invoke, registry, routing, cancellation, threads (keep small)
// - journal/: journal interface, in-memory and SQLite implementations
// - ops/: ops that run on the server (count for tests; lm, agent, compact)
// - net/: Bun.serve -> Socket adapter, connection lifecycle
import { getLogger } from "@logtape/logtape";
import { type Config, ConfigError, loadConfig } from "./config.ts";
import { Core } from "./core/core.ts";
import { InMemoryJournal } from "./journal/memory.ts";
import { setupLogging } from "./log.ts";
import { serve } from "./net/server.ts";
import { count } from "./ops/count.ts";

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

const journal = new InMemoryJournal();
const core = new Core({ journal });
core.registry.register(count);

const server = serve(core, { hostname: config.host, port: config.port });
log.info("start {url}", { url: `ws://${server.hostname}:${server.port}` });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("stop {signal}", { signal });
    void server.stop(true).finally(() => {
      journal.close();
      process.exit(0);
    });
  });
}
