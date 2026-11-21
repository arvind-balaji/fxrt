#!/usr/bin/env bun
// fxrt: the CLI, in two roles: a client you type into, and an executor.
// Layout:
// - ops/: fs.read, fs.write, fs.edit, fs.list, shell.exec, ask
// - ui/: Ink renderer, plain-output fallback for unknown event kinds
// - net/: WebSocket client -> Socket adapter, reconnect
// In --headless mode the CLI does not register `ask`.
import { getLogger } from "@logtape/logtape";
import { setupLogging } from "./log.ts";

const headless = process.argv.includes("--headless");
const verbose = process.argv.includes("--verbose");

await setupLogging({ verbose });
const log = getLogger(["fxrt", "cli"]);

const url = `ws://${process.env.FXRT_HOST ?? "127.0.0.1"}:${process.env.FXRT_PORT ?? 7420}`;

log.info("start {url}", { url, headless });
