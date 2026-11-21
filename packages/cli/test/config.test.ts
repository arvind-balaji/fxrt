import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, loadConfig } from "../src/config.ts";

const home = mkdtempSync(join(tmpdir(), "fxrt-config-"));
const url = "ws://127.0.0.1:7420";

function issues(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof ConfigError) return err.issues;
    throw err;
  }
  throw new Error("expected ConfigError");
}

describe("loadConfig", () => {
  test("server URL defaults to the local server", () => {
    const config = loadConfig({ argv: [], env: {}, home });
    expect(config.serverUrl).toBe(url);
    expect(config.sources.FXRT_SERVER_URL).toBe("default");
  });

  test("server URL must be ws or wss", () => {
    const env = { FXRT_SERVER_URL: "http://x" };
    expect(issues(() => loadConfig({ argv: [], env, home }))).toEqual([
      "FXRT_SERVER_URL: must be a ws:// or wss:// URL",
    ]);
  });

  test("log path defaults per OS", () => {
    const env = { FXRT_SERVER_URL: url };
    expect(loadConfig({ argv: [], env, home, platform: "darwin" }).cliLog).toBe(
      join(home, "Library", "Logs", "fxrt", "cli.log"),
    );
    expect(loadConfig({ argv: [], env, home, platform: "linux" }).cliLog).toBe(
      join(home, ".local", "state", "fxrt", "cli.log"),
    );
    const xdg = { ...env, XDG_STATE_HOME: "/xdg" };
    expect(loadConfig({ argv: [], env: xdg, home, platform: "linux" }).cliLog).toBe(
      "/xdg/fxrt/cli.log",
    );
  });

  test("log path must be absolute", () => {
    const env = { FXRT_SERVER_URL: url, FXRT_CLI_LOG: "~/cli.log" };
    expect(issues(() => loadConfig({ argv: [], env, home }))).toEqual([
      "FXRT_CLI_LOG: must be an absolute path",
    ]);
  });

  test("environment overrides the config file", () => {
    const file = join(home, "cli.env");
    writeFileSync(file, `FXRT_SERVER_URL=${url}\nFXRT_LOG_LEVEL=debug\n`);
    const config = loadConfig({
      argv: ["--config", file],
      env: { FXRT_LOG_LEVEL: "warning" },
      home,
    });
    expect(config.serverUrl).toBe(url);
    expect(config.logLevel).toBe("warning");
    expect(config.configFile).toBe(file);
    expect(config.sources.FXRT_SERVER_URL).toBe("file");
    expect(config.sources.FXRT_LOG_LEVEL).toBe("env");
  });

  test("default config file location is optional, explicit one is not", () => {
    const env = { FXRT_SERVER_URL: url };
    expect(loadConfig({ argv: [], env, home }).configFile).toBeNull();
    expect(issues(() => loadConfig({ argv: ["--config", "/missing.env"], env, home }))).toEqual([
      "config file: not found: /missing.env",
    ]);
  });

  test("unknown flags are rejected", () => {
    const env = { FXRT_SERVER_URL: url };
    expect(issues(() => loadConfig({ argv: ["--nope"], env, home }))[0]).toStartWith("flags: ");
  });
});
