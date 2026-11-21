import { expect, test } from "bun:test";
import { ConfigError, loadConfig } from "../src/config.ts";

function issues(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof ConfigError) return err.issues;
    throw err;
  }
  throw new Error("expected ConfigError");
}

test("host and port default to localhost and the shared port", () => {
  const config = loadConfig({});
  expect(config).toMatchObject({ host: "127.0.0.1", port: 7420 });
  expect(config.sources).toMatchObject({ FXRT_HOST: "default", FXRT_PORT: "default" });
});

test("port must be in range", () => {
  expect(issues(() => loadConfig({ FXRT_HOST: "127.0.0.1", FXRT_PORT: "70000" }))).toEqual([
    "FXRT_PORT: must be 1-65535",
  ]);
});

test("log level defaults to info", () => {
  const config = loadConfig({ FXRT_HOST: "127.0.0.1", FXRT_PORT: "7420" });
  expect(config).toMatchObject({ host: "127.0.0.1", port: 7420, logLevel: "info" });
  expect(config.sources.FXRT_LOG_LEVEL).toBe("default");
});
