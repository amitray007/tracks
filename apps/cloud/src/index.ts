#!/usr/bin/env node

import { startTracksCloud } from "./server.js";

const token = process.env.TRACKS_CLOUD_TOKEN;
if (!token) throw new Error("TRACKS_CLOUD_TOKEN is required.");

const port = Number.parseInt(process.env.TRACKS_CLOUD_PORT ?? "8787", 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid TRACKS_CLOUD_PORT: ${process.env.TRACKS_CLOUD_PORT}`);
}

const host = process.env.TRACKS_CLOUD_HOST ?? "127.0.0.1";
const webDirectory = process.env.TRACKS_CLOUD_WEB_DIR;
const cloud = await startTracksCloud({
  host,
  port,
  token,
  ...(webDirectory ? { webDirectory } : {}),
});
console.log(`Tracks Server is ready at ${cloud.url}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await cloud.close();
    process.exit(0);
  });
}
