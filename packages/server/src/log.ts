import { configure, getConsoleSink, getJsonLinesFormatter, parseLogLevel } from "@logtape/logtape";

export async function setupLogging(): Promise<void> {
  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: getJsonLinesFormatter({ message: "template", properties: "flatten" }),
      }),
    },
    loggers: [
      {
        category: "fxrt",
        sinks: ["console"],
        lowestLevel: parseLogLevel(process.env.FXRT_LOG_LEVEL ?? "info"),
      },
      { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
    ],
  });
}
