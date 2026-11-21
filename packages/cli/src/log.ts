import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getFileSink } from "@logtape/file";
import {
  configure,
  getStreamSink,
  getTextFormatter,
  parseLogLevel,
  type Sink,
} from "@logtape/logtape";

// Ink owns stdout, so logs go to a file. --verbose also sends them to stderr.
export async function setupLogging(opts: { verbose: boolean }): Promise<string> {
  const path = process.env.FXRT_CLI_LOG ?? join(homedir(), ".fxrt", "cli.log");
  mkdirSync(dirname(path), { recursive: true });
  const formatter = getTextFormatter({ value: "bare" });

  const sinks: Record<string, Sink> = { file: getFileSink(path, { formatter }) };
  if (opts.verbose) {
    const stderr = new WritableStream<Uint8Array>({
      write: (chunk) => void process.stderr.write(chunk),
    });
    sinks.stderr = getStreamSink(stderr, { formatter });
  }

  await configure({
    sinks,
    loggers: [
      {
        category: "fxrt",
        sinks: Object.keys(sinks),
        lowestLevel: parseLogLevel(process.env.FXRT_LOG_LEVEL ?? "info"),
      },
      { category: ["logtape", "meta"], sinks: ["file"], lowestLevel: "warning" },
    ],
  });
  return path;
}
