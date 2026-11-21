import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getFileSink } from "@logtape/file";
import {
  configure,
  getStreamSink,
  getTextFormatter,
  type LogLevel,
  type Sink,
} from "@logtape/logtape";

// Ink owns stdout, so logs go to a file. --verbose also sends them to stderr.
export async function setupLogging(cfg: {
  cliLog: string;
  logLevel: LogLevel;
  verbose: boolean;
}): Promise<void> {
  mkdirSync(dirname(cfg.cliLog), { recursive: true });
  const formatter = getTextFormatter({ value: "bare" });

  const sinks: Record<string, Sink> = { file: getFileSink(cfg.cliLog, { formatter }) };
  if (cfg.verbose) {
    const stderr = new WritableStream<Uint8Array>({
      write: (chunk) => void process.stderr.write(chunk),
    });
    sinks.stderr = getStreamSink(stderr, { formatter });
  }

  await configure({
    sinks,
    loggers: [
      { category: "fxrt", sinks: Object.keys(sinks), lowestLevel: cfg.logLevel },
      { category: ["logtape", "meta"], sinks: ["file"], lowestLevel: "warning" },
    ],
  });
}
