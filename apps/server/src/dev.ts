import { startTracksServer } from "./server.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "4318", 10);
const server = await startTracksServer({ host, port, staticDirectory: false });

console.log(`Tracks API ready at ${process.env.PORTLESS_URL ?? server.url}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
