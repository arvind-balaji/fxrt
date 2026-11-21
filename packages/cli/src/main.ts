#!/usr/bin/env -S bun --no-env-file
// fxrt: the CLI, in two roles: a client you type into, and an executor.
// Layout:
// - ops/: fs.read, fs.write, fs.edit, fs.list, shell.exec, ask
// - ui/: Ink renderer, plain-output fallback for unknown event kinds
// - net/: WebSocket client -> Socket adapter, reconnect
// In --headless mode the CLI does not register `ask`.
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
const log = getLogger(["fxrt", "cli"]);
log.debug("config file={file} log={log} sources={sources}", {
  file: config.configFile,
  log: config.cliLog,
  sources: Object.entries(config.sources)
    .map(([k, v]) => `${k}=${v}`)
    .join(" "),
});

log.info("start {url}", { url: config.serverUrl, headless: config.headless });
