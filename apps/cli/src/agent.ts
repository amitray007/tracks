import { open, rm } from "node:fs/promises";
import { startTracksServer, type RemoteConnectionSnapshot, type RunningTracksServer } from "@tracks/server";
import { HostedConnector } from "./connector.js";
import {
  isProcessRunning,
  readConfig,
  readRuntimeState,
  removeRuntimeFiles,
  tracksPaths,
  writeRuntimeState,
  type TracksConfig,
  type TracksRuntimeState,
} from "./config.js";

async function acquireAgentLock(): Promise<void> {
  const paths = tracksPaths();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(paths.lock, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      await handle.close();
      return;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      const state = await readRuntimeState();
      if (state && isProcessRunning(state.pid)) {
        throw new Error(`Tracks is already running with PID ${state.pid}.`);
      }
      await rm(paths.lock, { force: true });
    }
  }
  throw new Error("Tracks could not acquire its background-agent lock.");
}

function remoteForConfig(config: TracksConfig): RemoteConnectionSnapshot {
  return {
    configured: Boolean(config.cloud.serverUrl && config.cloud.token),
    connected: false,
    serverUrl: config.cloud.serverUrl,
    deviceId: config.device.id,
    lastError: null,
  };
}

export async function runBackgroundAgent(): Promise<void> {
  process.title = "tracks-agent";
  await acquireAgentLock();

  let config = await readConfig();
  let connector: HostedConnector | null = null;
  let server: RunningTracksServer | null = null;
  let remote = remoteForConfig(config);
  let stopping = false;
  let persistChain = Promise.resolve();
  let reloadChain = Promise.resolve();

  const persist = () => {
    if (!server) return;
    const state: TracksRuntimeState = {
      version: 1,
      pid: process.pid,
      url: server.url,
      startedAt: currentStartedAt,
      sourceRoot: config.sourceRoot,
      remote,
    };
    persistChain = persistChain
      .then(() => writeRuntimeState(state))
      .catch((error) => console.error("Tracks could not update runtime state:", error));
  };

  const currentStartedAt = new Date().toISOString();
  try {
    server = await startTracksServer({
      port: config.web.port,
      ...(config.sourceRoot ? { sourceRoot: config.sourceRoot } : {}),
      onCatalogUpdated: (event) => connector?.notifyCatalogUpdated(event),
    });
  } catch (error) {
    await removeRuntimeFiles();
    throw error;
  }

  const applyConnectionConfig = async (nextConfig: TracksConfig) => {
    if (connector) await connector.stop();
    connector = null;
    server?.setRemoteBridge(null);
    config = nextConfig;
    remote = remoteForConfig(config);

    if (config.cloud.connect && config.cloud.serverUrl && config.cloud.token && server) {
      const nextConnector = new HostedConnector({
        serverUrl: config.cloud.serverUrl,
        token: config.cloud.token,
        device: config.device,
        catalog: server.catalog,
        onStatus: (snapshot) => {
          remote = snapshot;
          persist();
          server?.notifyRemoteUpdated();
        },
      });
      connector = nextConnector;
      server.setRemoteBridge(nextConnector);
      nextConnector.start();
    }
    persist();
  };

  await applyConnectionConfig(config);
  persist();
  console.log(`Tracks background agent is ready at ${server.url}`);

  const reload = () => {
    reloadChain = reloadChain
      .then(async () => applyConnectionConfig(await readConfig()))
      .catch((error) => console.error("Tracks could not reload configuration:", error));
  };
  process.on("SIGHUP", reload);

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      process.off("SIGHUP", reload);
      if (connector) await connector.stop();
      if (server) await server.close();
      server = null;
      await persistChain;
      await removeRuntimeFiles();
      resolve();
    };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
  });
}
