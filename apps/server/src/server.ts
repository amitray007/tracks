import { createReadStream, watch, type FSWatcher } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, dirname, extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import { TrackCatalog } from "./catalog.js";
import { getViewerAvatar, getViewerIdentity } from "./viewer-identity.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_STATIC_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "web",
  "dist",
);

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export interface TracksServerOptions {
  host?: string;
  port?: number;
  sourceRoot?: string;
  staticDirectory?: string | false;
}

export interface RunningTracksServer {
  url: string;
  catalog: TrackCatalog;
  close(): Promise<void>;
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

function isAllowedRequestHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const hostname = hostHeader.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]"))
    : hostHeader.split(":")[0] ?? "";
  return isLoopbackHost(hostname) || hostname.endsWith(".localhost");
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return isLoopbackHost(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
  );
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

function readInteger(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function serveStatic(
  requestPath: string,
  staticDirectory: string,
  response: ServerResponse,
): Promise<boolean> {
  const decoded = decodeURIComponent(requestPath);
  const requested = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const normalizedPath = normalize(requested);
  const candidate = join(staticDirectory, normalizedPath);

  if (relative(staticDirectory, candidate).startsWith(`..${sep}`)) {
    return false;
  }

  let filePath = candidate;
  try {
    const candidateStat = await stat(candidate);
    if (!candidateStat.isFile()) return false;
  } catch {
    filePath = join(staticDirectory, "index.html");
  }

  try {
    await access(filePath, constants.R_OK);
  } catch {
    return false;
  }

  const fileStat = await stat(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", MIME_TYPES[extname(filePath)] ?? "application/octet-stream");
  response.setHeader("Content-Length", fileStat.size);
  createReadStream(filePath).pipe(response);
  return true;
}

export async function startTracksServer(
  options: TracksServerOptions = {},
): Promise<RunningTracksServer> {
  const host = options.host ?? "127.0.0.1";
  if (!isLoopbackHost(host)) {
    throw new Error(`Tracks refuses to bind to non-loopback host: ${host}`);
  }

  const catalog = new TrackCatalog(
    options.sourceRoot ? { sourceRoot: options.sourceRoot } : {},
  );
  await catalog.refresh();
  const staticDirectory = options.staticDirectory === undefined
    ? DEFAULT_STATIC_DIRECTORY
    : options.staticDirectory;

  const eventClients = new Set<ServerResponse>();
  let eventSequence = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let sourceWatcher: FSWatcher | null = null;

  function sendEvent(event: string, value: unknown): void {
    const payload = `id: ${++eventSequence}\nevent: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
    for (const client of eventClients) client.write(payload);
  }

  function scheduleCatalogRefresh(filename: string | Buffer | null): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void catalog.refresh().then((nextLibrary) => {
        const changedFile = filename ? basename(filename.toString()) : null;
        sendEvent("catalog.updated", {
          changedFile,
          scannedAt: nextLibrary.scannedAt,
          total: nextLibrary.tracks.length,
        });
      }).catch(() => {
        sendEvent("catalog.error", { message: "The Claude session library could not be refreshed." });
      });
    }, 140);
  }

  try {
    await access(catalog.adapter.sourceRoot, constants.R_OK);
    sourceWatcher = watch(
      catalog.adapter.sourceRoot,
      { recursive: true, persistent: false },
      (_eventType, filename) => {
        if (!filename || filename.toString().endsWith(".jsonl")) {
          scheduleCatalogRefresh(filename);
        }
      },
    );
    sourceWatcher.on("error", () => {
      sendEvent("catalog.error", { message: "Live filesystem updates are temporarily unavailable." });
    });
  } catch {
    sourceWatcher = null;
  }

  const heartbeat = setInterval(() => {
    for (const client of eventClients) client.write(": heartbeat\n\n");
  }, 15_000);
  heartbeat.unref();

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    setSecurityHeaders(response);

    if (!isAllowedRequestHost(request.headers.host)) {
      sendJson(response, 421, { error: "Unrecognized local host." });
      return;
    }

    if (!isAllowedOrigin(request.headers.origin)) {
      sendJson(response, 403, { error: "Cross-origin access is not allowed." });
      return;
    }

    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);

    try {
      if (requestUrl.pathname === "/api/health") {
        const library = await catalog.library({ limit: 1 });
        sendJson(response, 200, {
          ok: true,
          version: "0.0.0",
          provider: "claude-code",
          sourceState: library.sourceState,
          trackCount: library.total,
          scannedAt: library.scannedAt,
        });
        return;
      }

      if (requestUrl.pathname === "/api/events") {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");
        response.flushHeaders();
        eventClients.add(response);
        response.write(`retry: 1500\nevent: connected\ndata: ${JSON.stringify({ scannedAt: new Date().toISOString() })}\n\n`);
        request.once("close", () => eventClients.delete(response));
        return;
      }

      if (requestUrl.pathname === "/api/viewer") {
        const identity = await getViewerIdentity();
        sendJson(response, 200, identity
          ? {
              login: identity.login,
              name: identity.name,
              avatarUrl: "/api/viewer/avatar",
              source: "github-cli",
            }
          : { login: null, name: null, avatarUrl: null, source: "fallback" });
        return;
      }

      if (requestUrl.pathname === "/api/viewer/avatar") {
        const avatar = await getViewerAvatar();
        if (!avatar) {
          sendJson(response, 404, { error: "GitHub avatar unavailable." });
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", avatar.contentType);
        response.setHeader("Content-Length", avatar.body.byteLength);
        response.setHeader("Cache-Control", "private, max-age=3600");
        response.end(avatar.body);
        return;
      }

      if (requestUrl.pathname === "/api/tracks") {
        const query = requestUrl.searchParams.get("q");
        const library = await catalog.library({
          ...(query ? { query } : {}),
          limit: readInteger(requestUrl.searchParams.get("limit"), 100),
          offset: readInteger(requestUrl.searchParams.get("offset"), 0),
          refresh: requestUrl.searchParams.get("refresh") === "1",
        });
        sendJson(response, 200, library);
        return;
      }

      if (requestUrl.pathname.startsWith("/api/tracks/")) {
        const trackId = decodeURIComponent(requestUrl.pathname.slice("/api/tracks/".length));
        const track = await catalog.loadTrack(
          trackId,
          readInteger(requestUrl.searchParams.get("limit"), 500),
          readInteger(requestUrl.searchParams.get("start"), 0),
          requestUrl.searchParams.get("direction") === "backward" ? "backward" : "forward",
          requestUrl.searchParams.has("before")
            ? readInteger(requestUrl.searchParams.get("before"), 0)
            : undefined,
        );
        if (!track) {
          sendJson(response, 404, { error: "Track not found." });
          return;
        }
        sendJson(response, 200, track);
        return;
      }

      if (staticDirectory && (await serveStatic(requestUrl.pathname, staticDirectory, response))) {
        return;
      }

      sendJson(response, 404, {
        error: staticDirectory
          ? "Not found."
          : "The API is running; the web development server is separate.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error";
      sendJson(response, 500, { error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Tracks could not determine its loopback address.");
  }

  return {
    url: `http://${host}:${address.port}`,
    catalog,
    close: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(heartbeat);
      sourceWatcher?.close();
      for (const client of eventClients) client.end();
      eventClients.clear();
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
