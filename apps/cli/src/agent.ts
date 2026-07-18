import { watch, type FSWatcher } from "node:fs";
import { constants } from "node:fs";
import { access, open, rm } from "node:fs/promises";
import { basename } from "node:path";
import {
  startTracksServer,
  TrackCatalog,
  type RemoteConnectionSnapshot,
  type RunningTracksServer,
} from "@tracks/server";
import { HostedConnector } from "./connector.js";
import {
  isProcessRunning,
  readConfig,
  readRuntimeState,
  removeRuntimeFiles,
  tracksPaths,
  writeConfig,
  writeRuntimeState,
  type TracksConfig,
  type TracksRuntimeState,
} from "./config.js";
import { normalizeServerUrl, validateServerToken, verifyServerAccess } from "./remote-access.js";
import { resolveWebDirectory } from "./web-directory.js";

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
  const catalog = new TrackCatalog(config.sourceRoot ? { sourceRoot: config.sourceRoot } : {});
  await catalog.refresh();

  let connector: HostedConnector | null = null;
  let server: RunningTracksServer | null = null;
  let sourceWatcher: FSWatcher | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let remote = remoteForConfig(config);
  let stopping = false;
  let persistChain = Promise.resolve();
  let reloadChain = Promise.resolve();
  const currentStartedAt = new Date().toISOString();
  const keepAlive = setInterval(() => undefined, 60_000);

  const persist = () => {
    const state: TracksRuntimeState = {
      version: 1,
      pid: process.pid,
      url: server?.url ?? null,
      startedAt: currentStartedAt,
      sourceRoot: config.sourceRoot,
      remote,
    };
    persistChain = persistChain
      .then(() => writeRuntimeState(state))
      .catch((error) => console.error("Tracks could not update runtime state:", error));
  };

  const stopStandaloneWatcher = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    sourceWatcher?.close();
    sourceWatcher = null;
  };

  const startStandaloneWatcher = async () => {
    if (server || sourceWatcher) return;
    try {
      await access(catalog.adapter.sourceRoot, constants.R_OK);
      sourceWatcher = watch(
        catalog.adapter.sourceRoot,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (filename && !filename.toString().endsWith(".jsonl")) return;
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            refreshTimer = null;
            void catalog.refresh().then((library) => {
              connector?.notifyCatalogUpdated({ scannedAt: library.scannedAt });
            }).catch((error) => {
              console.error(
                `Tracks could not refresh ${filename ? basename(filename.toString()) : "the session catalog"}:`,
                error,
              );
            });
          }, 140);
        },
      );
      sourceWatcher.on("error", (error) => {
        console.error("Tracks source watching is temporarily unavailable:", error);
      });
    } catch {
      sourceWatcher = null;
    }
  };

  async function waitForRemoteConnection(): Promise<RemoteConnectionSnapshot> {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (remote.connected) return remote;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    throw new Error(remote.lastError ?? "Tracks could not connect this device to the server.");
  }

  async function connectRemote(input?: { serverUrl?: string; token?: string }): Promise<RemoteConnectionSnapshot> {
    let nextConfig = config;
    if (input?.serverUrl || input?.token) {
      if (!input.serverUrl || !input.token) throw new Error("Provide both the server URL and device token.");
      const serverUrl = normalizeServerUrl(input.serverUrl);
      const token = validateServerToken(input.token);
      await verifyServerAccess(serverUrl, token);
      nextConfig = { ...config, cloud: { serverUrl, token, connect: true } };
    } else if (!config.cloud.serverUrl || !config.cloud.token) {
      throw new Error("Enter a Tracks Server URL and device token first.");
    } else {
      nextConfig = { ...config, cloud: { ...config.cloud, connect: true } };
    }
    await writeConfig(nextConfig);
    await applyConfig(nextConfig);
    return waitForRemoteConnection();
  }

  async function disconnectRemote({ forget }: { forget: boolean }): Promise<RemoteConnectionSnapshot> {
    const nextConfig: TracksConfig = {
      ...config,
      cloud: forget
        ? { serverUrl: null, token: null, connect: false }
        : { ...config.cloud, connect: false },
    };
    await writeConfig(nextConfig);
    await applyConfig(nextConfig);
    return remote;
  }

  async function startWebServer(): Promise<void> {
    if (server) return;
    stopStandaloneWatcher();
    server = await startTracksServer({
      port: config.web.port,
      catalog,
      staticDirectory: await resolveWebDirectory(),
      onCatalogUpdated: (event) => connector?.notifyCatalogUpdated(event),
      remoteController: {
        connect: connectRemote,
        disconnect: disconnectRemote,
      },
    });
    server.setRemoteState(remote);
    server.setRemoteBridge(connector);
  }

  async function stopWebServer(): Promise<void> {
    if (!server) return;
    const runningServer = server;
    server = null;
    await runningServer.close();
    await startStandaloneWatcher();
  }

  async function applyConfig(nextConfig: TracksConfig): Promise<void> {
    const shouldConnect = Boolean(
      nextConfig.cloud.connect && nextConfig.cloud.serverUrl && nextConfig.cloud.token,
    );
    const connectionChanged = nextConfig.cloud.connect !== config.cloud.connect
      || nextConfig.cloud.serverUrl !== config.cloud.serverUrl
      || nextConfig.cloud.token !== config.cloud.token
      || nextConfig.device.id !== config.device.id
      || nextConfig.device.name !== config.device.name;
    const reconcileConnector = connectionChanged
      || (shouldConnect && !connector)
      || (!shouldConnect && Boolean(connector));

    if (reconcileConnector && connector) await connector.stop();
    if (reconcileConnector) connector = null;
    config = nextConfig;

    if (reconcileConnector) remote = remoteForConfig(config);

    if (config.web.enabled) await startWebServer();
    else await stopWebServer();

    server?.setRemoteState(remote);
    server?.setRemoteBridge(null);

    if (reconcileConnector && shouldConnect && config.cloud.serverUrl && config.cloud.token) {
      const nextConnector = new HostedConnector({
        serverUrl: config.cloud.serverUrl,
        token: config.cloud.token,
        device: config.device,
        catalog,
        onStatus: (snapshot) => {
          remote = snapshot;
          persist();
          server?.notifyRemoteUpdated();
        },
      });
      connector = nextConnector;
      nextConnector.start();
    }

    server?.setRemoteBridge(connector);
    if (!server) await startStandaloneWatcher();
    persist();
  }

  try {
    await applyConfig(config);
  } catch (error) {
    clearInterval(keepAlive);
    stopStandaloneWatcher();
    await removeRuntimeFiles();
    throw error;
  }

  const readyServer = server as RunningTracksServer | null;
  console.log(readyServer
    ? `Tracks background agent is ready at ${readyServer.url}`
    : "Tracks background agent is ready without local web.");

  const reload = () => {
    reloadChain = reloadChain
      .then(async () => applyConfig(await readConfig()))
      .catch((error) => console.error("Tracks could not reload configuration:", error));
  };
  process.on("SIGHUP", reload);

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      process.off("SIGHUP", reload);
      clearInterval(keepAlive);
      stopStandaloneWatcher();
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
