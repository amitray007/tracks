#!/usr/bin/env node

import { parseArgs } from "node:util";
import { ClaudeCodeAdapter } from "@tracks/provider-claude-code";
import { startTracksServer } from "@tracks/server";
import open from "open";

const HELP = `Tracks — local Claude Code session viewer

Usage:
  tracks [serve] [--source <directory>] [--port <number>] [--no-open]
  tracks doctor [--source <directory>] [--json]
  tracks --help

The first implementation runs in the foreground. Background lifecycle, status,
stop, and share commands will build on this same loopback service.`;

const rawArguments = process.argv.slice(2);
const shouldOpen = !rawArguments.includes("--no-open");
const argumentsWithoutNegativeOpen = rawArguments.filter((argument) => argument !== "--no-open");
const command = argumentsWithoutNegativeOpen[0]?.startsWith("-")
  ? "serve"
  : (argumentsWithoutNegativeOpen.shift() ?? "serve");

const { values } = parseArgs({
  args: argumentsWithoutNegativeOpen,
  options: {
    source: { type: "string" },
    port: { type: "string" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (values.help || command === "help") {
  console.log(HELP);
  process.exit(0);
}

if (command === "doctor") {
  const startedAt = performance.now();
  const result = await new ClaudeCodeAdapter(
    values.source ? { sourceRoot: values.source } : {},
  ).scan();
  const report = {
    provider: "claude-code",
    sourceState: result.sourceState,
    trackCount: result.tracks.length,
    projectCount: new Set(result.tracks.map((track) => track.summary.projectId)).size,
    scanMilliseconds: Math.round(performance.now() - startedAt),
    message: result.sourceMessage,
  };

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Claude source: ${report.sourceState}`);
    console.log(`Sessions: ${report.trackCount} across ${report.projectCount} projects`);
    console.log(`Metadata scan: ${report.scanMilliseconds}ms`);
    if (report.message) console.log(report.message);
  }
  process.exit(result.sourceState === "unreadable" ? 1 : 0);
}

if (command !== "serve") {
  console.error(`Unknown command: ${command}\n`);
  console.error(HELP);
  process.exit(1);
}

const parsedPort = values.port ? Number.parseInt(values.port, 10) : 0;
if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
  throw new Error(`Invalid port: ${values.port}`);
}

const server = await startTracksServer({
  port: parsedPort,
  ...(values.source ? { sourceRoot: values.source } : {}),
});

console.log(`Tracks is ready at ${server.url}`);
if (shouldOpen) {
  try {
    await open(server.url, { wait: false });
  } catch {
    console.warn("The browser could not be opened automatically; use the URL above.");
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
