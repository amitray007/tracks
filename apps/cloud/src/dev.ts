import { randomBytes } from "node:crypto";
import { startTracksCloud } from "./server.js";

const token = process.env.TRACKS_CLOUD_TOKEN ?? randomBytes(24).toString("hex");
const cloud = await startTracksCloud({
  host: process.env.TRACKS_CLOUD_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.TRACKS_CLOUD_PORT ?? "8787", 10),
  token,
});

console.log(`Tracks Server development dashboard: ${cloud.url}`);
console.log(`Bootstrap token: ${token}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await cloud.close();
    process.exit(0);
  });
}
