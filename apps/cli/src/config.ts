import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import type { RemoteConnectionSnapshot } from "@tracks/server";

export interface TracksConfig {
  version: 1;
  device: {
    id: string;
    name: string;
  };
  sourceRoot: string | null;
  web: {
    port: number;
    openBrowser: boolean;
  };
  cloud: {
    serverUrl: string | null;
    token: string | null;
    connect: boolean;
  };
}

export interface TracksRuntimeState {
  version: 1;
  pid: number;
  url: string;
  startedAt: string;
  sourceRoot: string | null;
  remote: RemoteConnectionSnapshot;
}

export interface TracksPaths {
  directory: string;
  config: string;
  runtime: string;
  lock: string;
  log: string;
}

export function tracksPaths(): TracksPaths {
  const directory = process.env.TRACKS_STATE_DIR
    ? resolve(process.env.TRACKS_STATE_DIR)
    : join(homedir(), ".tracks");
  return {
    directory,
    config: join(directory, "config.json"),
    runtime: join(directory, "runtime.json"),
    lock: join(directory, "agent.lock"),
    log: join(directory, "agent.log"),
  };
}

export function defaultConfig(): TracksConfig {
  return {
    version: 1,
    device: {
      id: randomUUID(),
      name: hostname() || "Tracks device",
    },
    sourceRoot: null,
    web: {
      port: 0,
      openBrowser: true,
    },
    cloud: {
      serverUrl: null,
      token: null,
      connect: false,
    },
  };
}

function normalizedConfig(value: unknown): TracksConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const device = record.device && typeof record.device === "object"
    ? record.device as Record<string, unknown>
    : {};
  const web = record.web && typeof record.web === "object"
    ? record.web as Record<string, unknown>
    : {};
  const cloud = record.cloud && typeof record.cloud === "object"
    ? record.cloud as Record<string, unknown>
    : {};
  const id = typeof device.id === "string" ? device.id : "";
  const name = typeof device.name === "string" ? device.name.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) || !name) return null;
  const port = typeof web.port === "number" && Number.isInteger(web.port) ? web.port : 0;
  if (port < 0 || port > 65_535) return null;
  return {
    version: 1,
    device: { id, name: name.slice(0, 80) },
    sourceRoot: typeof record.sourceRoot === "string" ? resolve(record.sourceRoot) : null,
    web: {
      port,
      openBrowser: web.openBrowser !== false,
    },
    cloud: {
      serverUrl: typeof cloud.serverUrl === "string" ? cloud.serverUrl : null,
      token: typeof cloud.token === "string" ? cloud.token : null,
      connect: cloud.connect === true,
    },
  };
}

export async function ensureTracksDirectory(): Promise<TracksPaths> {
  const paths = tracksPaths();
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  await chmod(paths.directory, 0o700);
  return paths;
}

export async function readConfig(): Promise<TracksConfig> {
  const paths = await ensureTracksDirectory();
  try {
    const parsed: unknown = JSON.parse(await readFile(paths.config, "utf8"));
    const config = normalizedConfig(parsed);
    if (!config) throw new Error("Tracks configuration is invalid.");
    return config;
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && !error.message.includes("ENOENT"))) {
      throw error;
    }
    const config = defaultConfig();
    await writeConfig(config);
    return config;
  }
}

export async function writeConfig(config: TracksConfig): Promise<void> {
  const paths = await ensureTracksDirectory();
  const temporary = `${paths.config}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, paths.config);
  await chmod(paths.config, 0o600);
}

export async function readRuntimeState(): Promise<TracksRuntimeState | null> {
  const paths = tracksPaths();
  try {
    const value: unknown = JSON.parse(await readFile(paths.runtime, "utf8"));
    if (!value || typeof value !== "object") return null;
    const state = value as Partial<TracksRuntimeState>;
    if (state.version !== 1 || typeof state.pid !== "number" || typeof state.url !== "string") return null;
    return state as TracksRuntimeState;
  } catch {
    return null;
  }
}

export async function writeRuntimeState(state: TracksRuntimeState): Promise<void> {
  const paths = await ensureTracksDirectory();
  const temporary = `${paths.runtime}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, paths.runtime);
  await chmod(paths.runtime, 0o600);
}

export async function removeRuntimeFiles(): Promise<void> {
  const paths = tracksPaths();
  await Promise.all([
    rm(paths.runtime, { force: true }),
    rm(paths.lock, { force: true }),
  ]);
}

export function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function publicConfig(config: TracksConfig): unknown {
  return {
    ...config,
    cloud: {
      ...config.cloud,
      token: config.cloud.token ? "configured" : null,
    },
  };
}
