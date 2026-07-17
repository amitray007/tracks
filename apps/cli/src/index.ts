#!/usr/bin/env node

import { closeSync, openSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ClaudeCodeAdapter } from "@tracks/provider-claude-code";
import { startTracksServer } from "@tracks/server";
import openBrowser from "open";
import { runBackgroundAgent } from "./agent.js";
import {
  isProcessRunning,
  publicConfig,
  readConfig,
  readRuntimeState,
  removeRuntimeFiles,
  tracksPaths,
  writeConfig,
  type TracksConfig,
  type TracksRuntimeState,
} from "./config.js";

const HELP = `Tracks — local and connected Claude Code session viewer

Usage:
  tracks [web] [start] [--source <directory>] [--port <number>] [--no-open]
  tracks web stop | status
  tracks login --server <url> [--token <token> | --token-stdin]
  tracks logout
  tracks connect [start] | stop
  tracks config list | get <key> | set <key> <value>
  tracks status [--json]
  tracks doctor [--source <directory>] [--json]
  tracks serve [--source <directory>] [--port <number>] [--no-open]

Local web does not require login. Login/connect only enable the optional hosted
device view and live links. Use TRACKS_STATE_DIR to isolate config/runtime state.`;

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parsePort(value: string | undefined): number {
  if (value === undefined) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

async function healthyRuntime(state: TracksRuntimeState | null): Promise<boolean> {
  if (!state || !isProcessRunning(state.pid)) return false;
  try {
    const response = await fetch(`${state.url}/api/health`, {
      signal: AbortSignal.timeout(1_200),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const value = await response.json() as { ok?: unknown; provider?: unknown };
    return value.ok === true && value.provider === "claude-code";
  } catch {
    return false;
  }
}

async function waitForRuntime(timeoutMs = 12_000): Promise<TracksRuntimeState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readRuntimeState();
    if (await healthyRuntime(state)) return state!;
    await sleep(100);
  }
  const paths = tracksPaths();
  let detail = "";
  try {
    const log = await readFile(paths.log, "utf8");
    detail = log.trim().split("\n").slice(-4).join("\n");
  } catch {
    // No agent log was created.
  }
  throw new Error(`Tracks did not become ready.${detail ? `\n${detail}` : ""}`);
}

async function signalAgent(signal: NodeJS.Signals): Promise<boolean> {
  const state = await readRuntimeState();
  if (!state || !isProcessRunning(state.pid)) return false;
  process.kill(state.pid, signal);
  return true;
}

async function stopBackgroundAgent(): Promise<boolean> {
  const state = await readRuntimeState();
  if (!state || !isProcessRunning(state.pid)) {
    await removeRuntimeFiles();
    return false;
  }
  process.kill(state.pid, "SIGTERM");
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(state.pid)) {
      await removeRuntimeFiles();
      return true;
    }
    await sleep(100);
  }
  throw new Error(`Tracks agent ${state.pid} did not stop cleanly.`);
}

async function launchBackgroundAgent(): Promise<TracksRuntimeState> {
  const current = await readRuntimeState();
  if (await healthyRuntime(current)) return current!;
  if (current && !isProcessRunning(current.pid)) await removeRuntimeFiles();

  const paths = tracksPaths();
  const logDescriptor = openSync(paths.log, "a", 0o600);
  const entry = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, [...process.execArgv, entry, "__agent"], {
    detached: true,
    env: process.env,
    stdio: ["ignore", logDescriptor, logDescriptor],
  });
  child.unref();
  closeSync(logDescriptor);
  return waitForRuntime();
}

async function maybeOpen(url: string, shouldOpen: boolean): Promise<void> {
  if (!shouldOpen) return;
  try {
    await openBrowser(url, { wait: false });
  } catch {
    console.warn("The browser could not be opened automatically; use the URL above.");
  }
}

async function runWeb(arguments_: string[]): Promise<void> {
  const action = arguments_[0] && !arguments_[0]!.startsWith("-")
    ? arguments_.shift()!
    : "start";
  const { values } = parseArgs({
    args: arguments_,
    options: {
      source: { type: "string" },
      port: { type: "string" },
      json: { type: "boolean", default: false },
      open: { type: "boolean", default: true },
    },
    strict: true,
    allowNegative: true,
  });

  if (action === "stop") {
    const stopped = await stopBackgroundAgent();
    if (values.json) console.log(JSON.stringify({ stopped }));
    else console.log(stopped ? "Tracks local web stopped." : "Tracks local web is not running.");
    return;
  }
  if (action === "status") {
    await printStatus(Boolean(values.json), true);
    return;
  }
  if (action !== "start" && action !== "open") throw new Error(`Unknown web action: ${action}`);

  const previous = await readConfig();
  const next: TracksConfig = {
    ...previous,
    sourceRoot: values.source ?? previous.sourceRoot,
    web: {
      port: values.port === undefined ? previous.web.port : parsePort(values.port),
      openBrowser: values.open,
    },
  };
  const needsRestart = previous.sourceRoot !== next.sourceRoot || previous.web.port !== next.web.port;
  await writeConfig(next);
  if (needsRestart && await healthyRuntime(await readRuntimeState())) await stopBackgroundAgent();
  const state = await launchBackgroundAgent();
  if (values.json) console.log(JSON.stringify({ running: true, url: state.url, pid: state.pid }));
  else console.log(`Tracks is ready at ${state.url}`);
  await maybeOpen(state.url, values.open);
}

async function runDoctor(arguments_: string[]): Promise<void> {
  const { values } = parseArgs({
    args: arguments_,
    options: {
      source: { type: "string" },
      json: { type: "boolean", default: false },
    },
    strict: true,
  });
  const config = await readConfig();
  const startedAt = performance.now();
  const result = await new ClaudeCodeAdapter(
    values.source || config.sourceRoot ? { sourceRoot: values.source ?? config.sourceRoot! } : {},
  ).scan();
  const report = {
    provider: "claude-code",
    sourceState: result.sourceState,
    trackCount: result.tracks.length,
    projectCount: new Set(result.tracks.map((track) => track.summary.projectId)).size,
    scanMilliseconds: Math.round(performance.now() - startedAt),
    message: result.sourceMessage,
  };
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Claude source: ${report.sourceState}`);
    console.log(`Sessions: ${report.trackCount} across ${report.projectCount} projects`);
    console.log(`Metadata scan: ${report.scanMilliseconds}ms`);
    if (report.message) console.log(report.message);
  }
  if (result.sourceState === "unreadable") process.exitCode = 1;
}

async function runForegroundServe(arguments_: string[]): Promise<void> {
  const shouldOpen = !arguments_.includes("--no-open");
  const args = arguments_.filter((argument) => argument !== "--no-open");
  const { values } = parseArgs({
    args,
    options: {
      source: { type: "string" },
      port: { type: "string" },
    },
    strict: true,
  });
  const config = await readConfig();
  const server = await startTracksServer({
    port: values.port === undefined ? config.web.port : parsePort(values.port),
    ...(values.source || config.sourceRoot ? { sourceRoot: values.source ?? config.sourceRoot! } : {}),
  });
  console.log(`Tracks is ready at ${server.url}`);
  await maybeOpen(server.url, shouldOpen);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
  }
}

async function readTokenFromStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("Pipe the token to stdin when using --token-stdin.");
  let value = "";
  for await (const chunk of process.stdin) value += chunk.toString();
  return value.trim();
}

function normalizeServerUrl(value: string): string {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("Tracks Server URL must use http or https.");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error("Tracks Server URL must not contain credentials, query parameters, or a fragment.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

async function runLogin(arguments_: string[]): Promise<void> {
  const { values } = parseArgs({
    args: arguments_,
    options: {
      server: { type: "string" },
      token: { type: "string" },
      "token-stdin": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (!values.server) throw new Error("tracks login requires --server <url>.");
  const token = values["token-stdin"]
    ? await readTokenFromStdin()
    : values.token ?? process.env.TRACKS_CLOUD_TOKEN ?? "";
  if (token.length < 32) throw new Error("Tracks Server token must contain at least 32 characters.");
  const serverUrl = normalizeServerUrl(values.server);
  const response = await fetch(`${serverUrl}/api/devices`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Tracks Server rejected login (${response.status}).`);
  const config = await readConfig();
  await writeConfig({
    ...config,
    cloud: { ...config.cloud, serverUrl, token },
  });
  await signalAgent("SIGHUP");
  if (values.json) console.log(JSON.stringify({ loggedIn: true, serverUrl }));
  else console.log(`Logged in to ${serverUrl}. Run tracks connect to expose this device.`);
}

async function runLogout(): Promise<void> {
  const config = await readConfig();
  await writeConfig({
    ...config,
    cloud: { serverUrl: null, token: null, connect: false },
  });
  await signalAgent("SIGHUP");
  console.log("Tracks Server credentials removed. Local web remains available.");
}

async function runConnect(arguments_: string[]): Promise<void> {
  const action = arguments_[0] && !arguments_[0]!.startsWith("-")
    ? arguments_.shift()!
    : "start";
  const { values } = parseArgs({
    args: arguments_,
    options: { json: { type: "boolean", default: false } },
    strict: true,
  });
  const config = await readConfig();
  if (action === "stop") {
    await writeConfig({ ...config, cloud: { ...config.cloud, connect: false } });
    await signalAgent("SIGHUP");
    if (values.json) console.log(JSON.stringify({ connected: false }));
    else console.log("Tracks device connection stopped. Local web remains available.");
    return;
  }
  if (action !== "start") throw new Error(`Unknown connect action: ${action}`);
  if (!config.cloud.serverUrl || !config.cloud.token) {
    throw new Error("Run tracks login --server <url> before connecting this device.");
  }
  await writeConfig({ ...config, cloud: { ...config.cloud, connect: true } });
  const state = await launchBackgroundAgent();
  process.kill(state.pid, "SIGHUP");
  const deadline = Date.now() + 12_000;
  let latest = state;
  while (Date.now() < deadline) {
    latest = await readRuntimeState() ?? latest;
    if (latest.remote.connected) break;
    await sleep(120);
  }
  if (!latest.remote.connected) {
    throw new Error(latest.remote.lastError ?? "Tracks could not connect this device to the server.");
  }
  if (values.json) console.log(JSON.stringify({ connected: true, serverUrl: latest.remote.serverUrl }));
  else console.log(`Connected ${config.device.name} to ${latest.remote.serverUrl}.`);
}

async function printStatus(json: boolean, localOnly = false): Promise<void> {
  const config = await readConfig();
  const state = await readRuntimeState();
  const running = await healthyRuntime(state);
  const report = {
    running,
    pid: running ? state?.pid ?? null : null,
    url: running ? state?.url ?? null : null,
    sourceRoot: state?.sourceRoot ?? config.sourceRoot,
    remote: localOnly ? undefined : state?.remote ?? {
      configured: Boolean(config.cloud.serverUrl && config.cloud.token),
      connected: false,
      serverUrl: config.cloud.serverUrl,
      deviceId: config.device.id,
      lastError: null,
    },
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Local web: ${running ? `running at ${report.url} (PID ${report.pid})` : "stopped"}`);
  if (!localOnly && report.remote) {
    console.log(`Server: ${report.remote.configured ? report.remote.serverUrl : "not logged in"}`);
    console.log(`Device connection: ${report.remote.connected ? "connected" : "disconnected"}`);
    if (report.remote.lastError) console.log(`Last connection error: ${report.remote.lastError}`);
  }
}

function configValue(config: TracksConfig, key: string): unknown {
  switch (key) {
    case "source": return config.sourceRoot;
    case "web.port": return config.web.port;
    case "web.open-browser": return config.web.openBrowser;
    case "cloud.server-url": return config.cloud.serverUrl;
    case "cloud.connected": return config.cloud.connect;
    case "device.name": return config.device.name;
    case "device.id": return config.device.id;
    default: throw new Error(`Unknown config key: ${key}`);
  }
}

async function runConfig(arguments_: string[]): Promise<void> {
  const action = arguments_.shift() ?? "list";
  const config = await readConfig();
  if (action === "list") {
    console.log(JSON.stringify(publicConfig(config), null, 2));
    return;
  }
  if (action === "get") {
    const key = arguments_.shift();
    if (!key) throw new Error("tracks config get requires a key.");
    const value = configValue(config, key);
    console.log(typeof value === "string" ? value : JSON.stringify(value));
    return;
  }
  if (action !== "set") throw new Error(`Unknown config action: ${action}`);
  const key = arguments_.shift();
  const value = arguments_.shift();
  if (!key || value === undefined || arguments_.length > 0) {
    throw new Error("tracks config set requires exactly one key and value.");
  }
  let next = config;
  let restartRequired = false;
  switch (key) {
    case "source":
      next = { ...config, sourceRoot: value === "auto" ? null : value };
      restartRequired = true;
      break;
    case "web.port":
      next = { ...config, web: { ...config.web, port: parsePort(value) } };
      restartRequired = true;
      break;
    case "web.open-browser":
      if (!new Set(["true", "false"]).has(value)) throw new Error("Use true or false.");
      next = { ...config, web: { ...config.web, openBrowser: value === "true" } };
      break;
    case "cloud.server-url":
      next = { ...config, cloud: { ...config.cloud, serverUrl: normalizeServerUrl(value) } };
      break;
    case "device.name":
      if (!value.trim() || value.length > 80) throw new Error("Device name must contain 1–80 characters.");
      next = { ...config, device: { ...config.device, name: value.trim() } };
      break;
    default:
      throw new Error(`Config key is read-only or unknown: ${key}`);
  }
  await writeConfig(next);
  if (!restartRequired) await signalAgent("SIGHUP");
  console.log(`Updated ${key}.${restartRequired ? " Restart local web to apply it." : ""}`);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  if (raw.includes("--help") || raw.includes("-h") || raw[0] === "help") {
    console.log(HELP);
    return;
  }
  const command = raw[0] && !raw[0].startsWith("-") ? raw.shift()! : "web";
  if (command === "__agent") {
    await runBackgroundAgent();
    return;
  }
  if (command === "web") return runWeb(raw);
  if (command === "status") {
    const { values } = parseArgs({ args: raw, options: { json: { type: "boolean", default: false } }, strict: true });
    return printStatus(Boolean(values.json));
  }
  if (command === "login") return runLogin(raw);
  if (command === "logout") return runLogout();
  if (command === "connect") return runConnect(raw);
  if (command === "config") return runConfig(raw);
  if (command === "doctor") return runDoctor(raw);
  if (command === "serve") return runForegroundServe(raw);
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
