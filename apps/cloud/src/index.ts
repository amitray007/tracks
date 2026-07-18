#!/usr/bin/env node

import { startTracksCloud } from "./server.js";

const ownerToken = process.env.TRACKS_OWNER_TOKEN;
const deviceToken = process.env.TRACKS_DEVICE_TOKEN;
if (!ownerToken) throw new Error("TRACKS_OWNER_TOKEN is required.");
if (!deviceToken) throw new Error("TRACKS_DEVICE_TOKEN is required.");

const port = Number.parseInt(process.env.TRACKS_CLOUD_PORT ?? "8787", 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid TRACKS_CLOUD_PORT: ${process.env.TRACKS_CLOUD_PORT}`);
}

const host = process.env.TRACKS_CLOUD_HOST ?? "127.0.0.1";
const webDirectory = process.env.TRACKS_CLOUD_WEB_DIR;
const cloud = await startTracksCloud({
  host,
  port,
  ownerToken,
  deviceToken,
  ...(process.env.TRACKS_CLOUD_PUBLIC_URL ? { publicUrl: process.env.TRACKS_CLOUD_PUBLIC_URL } : {}),
  ...(webDirectory ? { webDirectory } : {}),
});
console.log(`Tracks Server is ready at ${cloud.url}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await cloud.close();
    process.exit(0);
  });
}
