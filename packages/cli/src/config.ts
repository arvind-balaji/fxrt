import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_HOST, DEFAULT_PORT } from "@fxrt/protocol";
import { parse as parseEnvFile } from "dotenv";
import { z } from "zod";

// The only module in the CLI that reads process.env and argv.
// The CLI runs with `bun --no-env-file`: it runs inside your project folder,
// so it must not load that project's .env. It reads a user config file instead.
//
// Precedence: flags > environment > config file > defaults.

const LOG_LEVELS = ["trace", "debug", "info", "warning", "error", "fatal"] as const;

const absolutePath = z.string().refine(isAbsolute, { error: "must be an absolute path" });

const Env = z.object({
  FXRT_SERVER_URL: z
    .url({ protocol: /^wss?$/, error: "must be a ws:// or wss:// URL" })
    .default(`ws://${DEFAULT_HOST}:${DEFAULT_PORT}`),
  FXRT_CLI_LOG: absolutePath.optional(),
  FXRT_STATE_DIR: absolutePath.optional(),
  FXRT_LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: `must be one of ${LOG_LEVELS.join(", ")}` })
    .default("info"),
});

type Source = "env" | "file" | "default";

export interface Config {
  serverUrl: string;
  cliLog: string;
  logLevel: (typeof LOG_LEVELS)[number];
  headless: boolean;
  verbose: boolean;
  /** The config file that was read, or null if none. */
  configFile: string | null;
  /** Where each FXRT_* setting came from. "default" for FXRT_CLI_LOG means a derived path. */
  sources: Record<string, Source>;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("\n"));
  }
}

export interface LoadOptions {
  argv?: string[];
  env?: Record<string, string | undefined>;
  home?: string;
  platform?: NodeJS.Platform;
}

export function loadConfig(opts: LoadOptions = {}): Config {
  const argv = opts.argv ?? process.argv.slice(2);
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const platform = opts.platform ?? process.platform;

  const flags = parseFlags(argv);
  const file = readConfigFile(flags.config, env, home);
  const { input, sources } = mergeSources(env, file.values);

  const parsed = Env.safeParse(input);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => {
        const key = String(i.path[0]);
        return `${key}: ${input[key] === undefined ? "required" : i.message}`;
      }),
    );
  }
  const e = parsed.data;

  const stateDir = e.FXRT_STATE_DIR ?? defaultStateDir(platform, env, home);

  return {
    serverUrl: e.FXRT_SERVER_URL,
    cliLog: e.FXRT_CLI_LOG ?? join(stateDir, "cli.log"),
    logLevel: e.FXRT_LOG_LEVEL,
    headless: flags.headless,
    verbose: flags.verbose,
    configFile: file.path,
    sources,
  };
}

// Config file: --config > FXRT_CONFIG > default location. Only the default may be missing.
function readConfigFile(
  flag: string | undefined,
  env: Record<string, string | undefined>,
  home: string,
): { path: string | null; values: Record<string, string> } {
  const explicitFile = flag ?? (env.FXRT_CONFIG || undefined);
  if (explicitFile !== undefined && !isAbsolute(explicitFile)) {
    throw new ConfigError([`config file: must be an absolute path: ${explicitFile}`]);
  }
  const configFile =
    explicitFile ?? join(env.XDG_CONFIG_HOME || join(home, ".config"), "fxrt", "cli.env");
  if (!existsSync(configFile)) {
    if (explicitFile !== undefined) {
      throw new ConfigError([`config file: not found: ${configFile}`]);
    }
    return { path: null, values: {} };
  }
  return { path: configFile, values: parseEnvFile(readFileSync(configFile)) };
}

// Merge file and environment; treat empty values as unset.
function mergeSources(
  env: Record<string, string | undefined>,
  fileValues: Record<string, string>,
): { input: Record<string, string>; sources: Record<string, Source> } {
  const sources: Record<string, Source> = {};
  const input: Record<string, string> = {};
  for (const k of Object.keys(Env.shape)) {
    const fromEnv = env[k];
    const fromFile = fileValues[k];
    if (fromEnv) {
      input[k] = fromEnv;
      sources[k] = "env";
    } else if (fromFile) {
      input[k] = fromFile;
      sources[k] = "file";
    } else {
      sources[k] = "default";
    }
  }
  return { input, sources };
}

function parseFlags(argv: string[]): { config?: string; headless: boolean; verbose: boolean } {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        config: { type: "string" },
        headless: { type: "boolean", default: false },
        verbose: { type: "boolean", default: false },
      },
      strict: true,
    });
    return { config: values.config, headless: values.headless, verbose: values.verbose };
  } catch (err) {
    throw new ConfigError([`flags: ${(err as Error).message}`]);
  }
}

// macOS: ~/Library/Logs/fxrt. Elsewhere: $XDG_STATE_HOME/fxrt, or ~/.local/state/fxrt.
function defaultStateDir(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string,
): string {
  if (platform === "darwin") return join(home, "Library", "Logs", "fxrt");
  return join(env.XDG_STATE_HOME || join(home, ".local", "state"), "fxrt");
}
