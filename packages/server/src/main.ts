#!/usr/bin/env bun
// fxrtd: the server. Layout:
// - core/: invoke, registry, routing, cancellation, threads (keep small)
// - journal/: journal interface + SQLite implementation
// - ops/: lm, agent, compact (ops that run on the server)
// - net/: Bun.serve -> Socket adapter, connection lifecycle
import { getLogger } from "@logtape/logtape";
import { setupLogging } from "./log.ts";

await setupLogging();
const log = getLogger(["fxrt", "server"]);

const host = process.env.FXRT_HOST ?? "127.0.0.1";
const port = Number(process.env.FXRT_PORT ?? 7420);

log.info("start {host}:{port}", { host, port });
