import { configure, getConsoleSink, getJsonLinesFormatter, type LogLevel } from "@logtape/logtape";

export async function setupLogging(cfg: { logLevel: LogLevel }): Promise<void> {
  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: getJsonLinesFormatter({ message: "template", properties: "flatten" }),
      }),
    },
    loggers: [
      { category: "fxrt", sinks: ["console"], lowestLevel: cfg.logLevel },
      { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
    ],
  });
}
