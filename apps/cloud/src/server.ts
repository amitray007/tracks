import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentMessageSchema,
  LIVE_PROTOCOL_VERSION,
  type ConnectedDevice,
  type ConnectedDevicesResponse,
  type DeviceDescriptor,
  type LibraryPageParameters,
  type ServerMessage,
  type ServerRequest,
  type TrackPageParameters,
} from "@tracks/live-protocol";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { DASHBOARD_CSS, DASHBOARD_HTML, DASHBOARD_JS } from "./dashboard.js";

const MINIMUM_TOKEN_LENGTH = 32;
const DEFAULT_MAX_DEVICES = 256;
const DEFAULT_MAX_EVENT_CLIENTS = 64;
const DEFAULT_MAX_PENDING_REQUESTS = 64;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_WEB_DIRECTORY = join(
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
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export interface TracksCloudOptions {
  host?: string;
  port?: number;
  ownerToken: string;
  deviceToken: string;
  heartbeatIntervalMs?: number;
  maxDevices?: number;
  maxEventClients?: number;
  maxPendingRequestsPerDevice?: number;
  requestTimeoutMs?: number;
  publicUrl?: string;
  webDirectory?: string | false;
}

export interface RunningTracksCloud {
  url: string;
  close(): Promise<void>;
}

interface ManagedDevice {
  descriptor: DeviceDescriptor;
  connectedAt: string;
  lastSeenAt: string;
  alive: boolean;
  socket: WebSocket;
  pendingRequests: Map<string, PendingDeviceRequest>;
}

interface PendingDeviceRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface RelayEventClient {
  response: ServerResponse;
  deviceId: string;
}

interface LiveShare {
  id: string;
  deviceId: string;
  trackId: string;
  secretDigest: Buffer;
  createdAt: string;
}

interface OwnerSession {
  expiresAt: number;
}

class DeviceOfflineError extends Error {}
class DeviceTimeoutError extends Error {}
class DeviceCapacityError extends Error {}

function tokenDigest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function bearerToken(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim();
}

function authorized(request: IncomingMessage, expectedDigest: Buffer): boolean {
  const supplied = bearerToken(request);
  if (!supplied) return false;
  return timingSafeEqual(tokenDigest(supplied), expectedDigest);
}

const OWNER_SESSION_COOKIE = "tracks_owner_session";
const OWNER_SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

function cookieValue(request: IncomingMessage, name: string): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function sessionKey(value: string): string {
  return tokenDigest(value).toString("hex");
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}

function send(response: ServerResponse, statusCode: number, contentType: string, body: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  send(response, statusCode, "application/json; charset=utf-8", JSON.stringify(body));
}

function rejectUpgrade(socket: import("node:stream").Duplex, statusCode: number, status: string): void {
  socket.write(`HTTP/1.1 ${statusCode} ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

async function readJsonBody(request: IncomingMessage, maximumBytes = 16 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maximumBytes) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function serveWebFile(
  requestPath: string,
  webDirectory: string,
  response: ServerResponse,
  fallbackToIndex: boolean,
): Promise<boolean> {
  const decoded = decodeURIComponent(requestPath);
  const requested = fallbackToIndex ? "index.html" : decoded.replace(/^\/+/, "");
  const normalizedPath = normalize(requested);
  const candidate = join(webDirectory, normalizedPath);
  const candidateRelative = relative(webDirectory, candidate);
  if (candidateRelative === ".." || candidateRelative.startsWith(`..${sep}`)) return false;

  try {
    await access(candidate);
    const fileStat = await stat(candidate);
    if (!fileStat.isFile()) return false;
    response.statusCode = 200;
    response.setHeader("Content-Type", MIME_TYPES[extname(candidate)] ?? "application/octet-stream");
    response.setHeader("Content-Length", fileStat.size);
    createReadStream(candidate).pipe(response);
    return true;
  } catch {
    return false;
  }
}

function headerValue(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" ? value : null;
}

function isShareAuthorized(request: IncomingMessage, share: LiveShare): boolean {
  const secret = headerValue(request, "x-tracks-share-token");
  if (!secret) return false;
  return timingSafeEqual(tokenDigest(secret), share.secretDigest);
}

function integerParameter(
  parameters: URLSearchParams,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = parameters.get(name);
  const parsed = raw === null ? fallback : Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

export async function startTracksCloud(options: TracksCloudOptions): Promise<RunningTracksCloud> {
  if (options.ownerToken.length < MINIMUM_TOKEN_LENGTH) {
    throw new Error(`TRACKS_OWNER_TOKEN must contain at least ${MINIMUM_TOKEN_LENGTH} characters.`);
  }
  if (options.deviceToken.length < MINIMUM_TOKEN_LENGTH) {
    throw new Error(`TRACKS_DEVICE_TOKEN must contain at least ${MINIMUM_TOKEN_LENGTH} characters.`);
  }
  if (timingSafeEqual(tokenDigest(options.ownerToken), tokenDigest(options.deviceToken))) {
    throw new Error("TRACKS_OWNER_TOKEN and TRACKS_DEVICE_TOKEN must be different secrets.");
  }

  const host = options.host ?? "127.0.0.1";
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  if (heartbeatIntervalMs < 1_000 || heartbeatIntervalMs > 120_000) {
    throw new Error("heartbeatIntervalMs must be between 1000 and 120000.");
  }
  const maxDevices = options.maxDevices ?? DEFAULT_MAX_DEVICES;
  const maxEventClients = options.maxEventClients ?? DEFAULT_MAX_EVENT_CLIENTS;
  const maxPendingRequestsPerDevice = options.maxPendingRequestsPerDevice ?? DEFAULT_MAX_PENDING_REQUESTS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (
    !Number.isInteger(maxDevices) || maxDevices < 1
    || !Number.isInteger(maxEventClients) || maxEventClients < 1
    || !Number.isInteger(maxPendingRequestsPerDevice) || maxPendingRequestsPerDevice < 1
    || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 120_000
  ) {
    throw new Error("Connection limits must be positive integers.");
  }
  const webDirectory = options.webDirectory === undefined ? DEFAULT_WEB_DIRECTORY : options.webDirectory;
  const expectedOwnerTokenDigest = tokenDigest(options.ownerToken);
  const expectedDeviceTokenDigest = tokenDigest(options.deviceToken);
  const secureOwnerCookie = options.publicUrl?.startsWith("https://") ?? false;
  const devices = new Map<string, ManagedDevice>();
  const eventClients = new Set<ServerResponse>();
  const relayEventClients = new Set<RelayEventClient>();
  const shares = new Map<string, LiveShare>();
  const ownerSessions = new Map<string, OwnerSession>();
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  function ownerAuthorized(request: IncomingMessage): boolean {
    const value = cookieValue(request, OWNER_SESSION_COOKIE);
    if (!value) return false;
    const key = sessionKey(value);
    const session = ownerSessions.get(key);
    if (!session) return false;
    if (session.expiresAt <= Date.now()) {
      ownerSessions.delete(key);
      return false;
    }
    return true;
  }

  function ownerCookie(value: string, maxAge: number): string {
    return [
      `${OWNER_SESSION_COOKIE}=${encodeURIComponent(value)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${maxAge}`,
      ...(secureOwnerCookie ? ["Secure"] : []),
    ].join("; ");
  }

  function requireOwner(request: IncomingMessage, response: ServerResponse): boolean {
    if (ownerAuthorized(request)) return true;
    sendJson(response, 401, { error: "Owner sign-in required." });
    return false;
  }

  function connectedDevices(): ConnectedDevicesResponse {
    const projected: ConnectedDevice[] = [...devices.values()]
      .map(({ descriptor, connectedAt, lastSeenAt }) => ({
        ...descriptor,
        connectedAt,
        lastSeenAt,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    return { devices: projected, generatedAt: new Date().toISOString() };
  }

  function publishDevices(): void {
    const message = `event: devices.updated\ndata: ${JSON.stringify(connectedDevices())}\n\n`;
    for (const client of eventClients) {
      if (!client.write(message)) {
        eventClients.delete(client);
        client.end();
      }
    }
  }

  function publishRelayEvent(deviceId: string, event: string, value: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
    for (const client of relayEventClients) {
      if (client.deviceId !== deviceId) continue;
      if (!client.response.write(message)) {
        relayEventClients.delete(client);
        client.response.end();
      }
    }
  }

  function addRelayEventClient(response: ServerResponse, request: IncomingMessage, deviceId: string): void {
    if (eventClients.size + relayEventClients.size >= maxEventClients) {
      sendJson(response, 503, { error: "Live event capacity reached." });
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    const client = { response, deviceId };
    relayEventClients.add(client);
    response.write(`retry: 1500\nevent: connected\ndata: ${JSON.stringify({
      online: devices.has(deviceId),
      at: new Date().toISOString(),
    })}\n\n`);
    request.once("close", () => relayEventClients.delete(client));
  }

  function rejectPendingRequests(managed: ManagedDevice, error: Error): void {
    for (const pending of managed.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    managed.pendingRequests.clear();
  }

  function requestDevice(
    deviceId: string,
    operation: ServerRequest["operation"],
    parameters: LibraryPageParameters | TrackPageParameters,
  ): Promise<unknown> {
    const managed = devices.get(deviceId);
    if (!managed || managed.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new DeviceOfflineError("The source device is offline."));
    }
    if (managed.pendingRequests.size >= maxPendingRequestsPerDevice) {
      return Promise.reject(new DeviceCapacityError("The source device has too many active requests."));
    }
    const requestId = randomUUID();
    const message = {
      type: "server.request",
      requestId,
      operation,
      parameters,
    } as ServerRequest;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        managed.pendingRequests.delete(requestId);
        reject(new DeviceTimeoutError("The source device did not answer in time."));
      }, requestTimeoutMs);
      timeout.unref();
      managed.pendingRequests.set(requestId, { resolve, reject, timeout });
      managed.socket.send(JSON.stringify(message), (error) => {
        if (!error) return;
        const pending = managed.pendingRequests.get(requestId);
        if (!pending) return;
        managed.pendingRequests.delete(requestId);
        clearTimeout(pending.timeout);
        pending.reject(error);
      });
    });
  }

  function createShare(deviceId: string, trackId: string): {
    share: LiveShare;
    viewerSecret: string;
    path: string;
  } {
    const id = randomUUID();
    const viewerSecret = randomBytes(32).toString("base64url");
    const share: LiveShare = {
      id,
      deviceId,
      trackId,
      secretDigest: tokenDigest(viewerSecret),
      createdAt: new Date().toISOString(),
    };
    shares.set(id, share);
    return { share, viewerSecret, path: `/s/${id}` };
  }

  function sendRelayError(response: ServerResponse, error: unknown): void {
    if (error instanceof DeviceOfflineError) {
      sendJson(response, 503, { error: error.message, code: "device_offline" });
    } else if (error instanceof DeviceTimeoutError) {
      sendJson(response, 504, { error: error.message, code: "device_timeout" });
    } else if (error instanceof DeviceCapacityError) {
      sendJson(response, 429, { error: error.message, code: "device_busy" });
    } else {
      sendJson(response, 502, { error: error instanceof Error ? error.message : "Device request failed." });
    }
  }

  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const method = request.method ?? "GET";

    try {
      if (method === "GET" && requestUrl.pathname === "/") {
        send(response, 200, "text/html; charset=utf-8", DASHBOARD_HTML);
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/dashboard.css") {
        send(response, 200, "text/css; charset=utf-8", DASHBOARD_CSS);
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/dashboard.js") {
        send(response, 200, "text/javascript; charset=utf-8", DASHBOARD_JS);
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/api/health") {
        sendJson(response, 200, { ok: true });
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/api/auth/session") {
        if (!requireOwner(request, response)) return;
        sendJson(response, 200, { authenticated: true });
        return;
      }
      if (method === "POST" && requestUrl.pathname === "/api/auth/login") {
        const body = await readJsonBody(request);
        const token = typeof body === "object" && body && "token" in body
          ? String(body.token)
          : "";
        if (
          token.length < MINIMUM_TOKEN_LENGTH
          || !timingSafeEqual(tokenDigest(token), expectedOwnerTokenDigest)
        ) {
          sendJson(response, 401, { error: "The owner token was not accepted." });
          return;
        }
        const sessionToken = randomBytes(32).toString("base64url");
        ownerSessions.set(sessionKey(sessionToken), {
          expiresAt: Date.now() + OWNER_SESSION_LIFETIME_SECONDS * 1_000,
        });
        response.setHeader("Set-Cookie", ownerCookie(sessionToken, OWNER_SESSION_LIFETIME_SECONDS));
        sendJson(response, 200, { authenticated: true });
        return;
      }
      if (method === "POST" && requestUrl.pathname === "/api/auth/logout") {
        const sessionToken = cookieValue(request, OWNER_SESSION_COOKIE);
        if (sessionToken) ownerSessions.delete(sessionKey(sessionToken));
        response.setHeader("Set-Cookie", ownerCookie("", 0));
        sendJson(response, 200, { authenticated: false });
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/api/agent/access") {
        if (!authorized(request, expectedDeviceTokenDigest)) {
          sendJson(response, 401, { error: "Device access token required." });
          return;
        }
        sendJson(response, 200, { authorized: true });
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/api/devices") {
        if (!requireOwner(request, response)) return;
        sendJson(response, 200, connectedDevices());
        return;
      }
      if (method === "GET" && requestUrl.pathname === "/api/events") {
        if (!requireOwner(request, response)) return;
        if (eventClients.size + relayEventClients.size >= maxEventClients) {
          sendJson(response, 503, { error: "Presence stream capacity reached." });
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");
        response.flushHeaders();
        eventClients.add(response);
        response.write(`retry: 1500\nevent: devices.updated\ndata: ${JSON.stringify(connectedDevices())}\n\n`);
        request.once("close", () => eventClients.delete(response));
        return;
      }

      const deviceContextMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/context$/);
      if (method === "GET" && deviceContextMatch) {
        if (!requireOwner(request, response)) return;
        const deviceId = decodeURIComponent(deviceContextMatch[1]!);
        const managed = devices.get(deviceId);
        sendJson(response, 200, {
          surface: "cloud-device",
          deviceId,
          deviceName: managed?.descriptor.name ?? null,
          online: Boolean(managed),
        });
        return;
      }

      const deviceTracksMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/tracks$/);
      if (method === "GET" && deviceTracksMatch) {
        if (!requireOwner(request, response)) return;
        const deviceId = decodeURIComponent(deviceTracksMatch[1]!);
        try {
          const payload = await requestDevice(deviceId, "library.page", {
            ...(requestUrl.searchParams.get("q")?.trim()
              ? { query: requestUrl.searchParams.get("q")!.trim().slice(0, 240) }
              : {}),
            limit: integerParameter(requestUrl.searchParams, "limit", 60, 1, 100),
            offset: integerParameter(requestUrl.searchParams, "offset", 0, 0, 10_000_000),
          });
          sendJson(response, 200, payload);
        } catch (error) {
          sendRelayError(response, error);
        }
        return;
      }

      const deviceTrackMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/tracks\/(.+)$/);
      if (method === "GET" && deviceTrackMatch) {
        if (!requireOwner(request, response)) return;
        const deviceId = decodeURIComponent(deviceTrackMatch[1]!);
        const trackId = decodeURIComponent(deviceTrackMatch[2]!);
        try {
          const payload = await requestDevice(deviceId, "track.page", {
            trackId,
            limit: integerParameter(requestUrl.searchParams, "limit", 120, 1, 250),
            direction: requestUrl.searchParams.get("direction") === "backward" ? "backward" : "forward",
            ...(requestUrl.searchParams.has("before")
              ? { beforeSequence: integerParameter(requestUrl.searchParams, "before", 0, 0, 100_000_000) }
              : { startSequence: integerParameter(requestUrl.searchParams, "start", 0, 0, 100_000_000) }),
          });
          sendJson(response, 200, payload);
        } catch (error) {
          sendRelayError(response, error);
        }
        return;
      }

      const deviceEventsMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/events$/);
      if (method === "GET" && deviceEventsMatch) {
        if (!requireOwner(request, response)) return;
        addRelayEventClient(response, request, decodeURIComponent(deviceEventsMatch[1]!));
        return;
      }

      const deviceViewerMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/viewer$/);
      if (method === "GET" && deviceViewerMatch) {
        if (!requireOwner(request, response)) return;
        sendJson(response, 200, { login: null, name: null, avatarUrl: null, source: "fallback" });
        return;
      }

      const deviceShareMatch = requestUrl.pathname.match(/^\/api\/devices\/([^/]+)\/shares$/);
      if (method === "POST" && deviceShareMatch) {
        if (!requireOwner(request, response)) return;
        const deviceId = decodeURIComponent(deviceShareMatch[1]!);
        if (!devices.has(deviceId)) {
          sendJson(response, 503, { error: "The source device is offline.", code: "device_offline" });
          return;
        }
        const body = await readJsonBody(request);
        const trackId = typeof body === "object" && body && "trackId" in body
          ? String(body.trackId)
          : "";
        if (!trackId || trackId.length > 512) {
          sendJson(response, 400, { error: "A valid trackId is required." });
          return;
        }
        const created = createShare(deviceId, trackId);
        sendJson(response, 201, {
          shareId: created.share.id,
          path: created.path,
          viewerSecret: created.viewerSecret,
        });
        return;
      }

      const shareContextMatch = requestUrl.pathname.match(/^\/api\/shares\/([^/]+)\/context$/);
      if (method === "GET" && shareContextMatch) {
        const share = shares.get(decodeURIComponent(shareContextMatch[1]!));
        if (!share || !isShareAuthorized(request, share)) {
          sendJson(response, 404, { error: "Live share not found." });
          return;
        }
        sendJson(response, 200, {
          surface: "live-share",
          trackId: share.trackId,
          online: devices.has(share.deviceId),
          createdAt: share.createdAt,
        });
        return;
      }

      const shareTrackMatch = requestUrl.pathname.match(/^\/api\/shares\/([^/]+)\/tracks\/(.+)$/);
      if (method === "GET" && shareTrackMatch) {
        const share = shares.get(decodeURIComponent(shareTrackMatch[1]!));
        const requestedTrackId = decodeURIComponent(shareTrackMatch[2]!);
        if (!share || !isShareAuthorized(request, share) || requestedTrackId !== share.trackId) {
          sendJson(response, 404, { error: "Live share not found." });
          return;
        }
        try {
          const payload = await requestDevice(share.deviceId, "track.page", {
            trackId: share.trackId,
            limit: integerParameter(requestUrl.searchParams, "limit", 120, 1, 250),
            direction: requestUrl.searchParams.get("direction") === "backward" ? "backward" : "forward",
            ...(requestUrl.searchParams.has("before")
              ? { beforeSequence: integerParameter(requestUrl.searchParams, "before", 0, 0, 100_000_000) }
              : { startSequence: integerParameter(requestUrl.searchParams, "start", 0, 0, 100_000_000) }),
          });
          sendJson(response, 200, payload);
        } catch (error) {
          sendRelayError(response, error);
        }
        return;
      }

      const shareEventsMatch = requestUrl.pathname.match(/^\/api\/shares\/([^/]+)\/events$/);
      if (method === "GET" && shareEventsMatch) {
        const share = shares.get(decodeURIComponent(shareEventsMatch[1]!));
        if (!share || !isShareAuthorized(request, share)) {
          sendJson(response, 404, { error: "Live share not found." });
          return;
        }
        addRelayEventClient(response, request, share.deviceId);
        return;
      }

      const shareViewerMatch = requestUrl.pathname.match(/^\/api\/shares\/([^/]+)\/viewer$/);
      if (method === "GET" && shareViewerMatch) {
        const share = shares.get(decodeURIComponent(shareViewerMatch[1]!));
        if (!share || !isShareAuthorized(request, share)) {
          sendJson(response, 404, { error: "Live share not found." });
          return;
        }
        sendJson(response, 200, { login: null, name: null, avatarUrl: null, source: "fallback" });
        return;
      }

      if (method === "GET" && webDirectory && requestUrl.pathname.startsWith("/assets/")) {
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        if (await serveWebFile(requestUrl.pathname, webDirectory, response, false)) return;
      }
      if (
        method === "GET"
        && webDirectory
        && (/^\/device\/[^/]+\/?$/.test(requestUrl.pathname) || /^\/s\/[^/]+\/?$/.test(requestUrl.pathname))
      ) {
        if (/^\/device\/[^/]+\/?$/.test(requestUrl.pathname) && !ownerAuthorized(request)) {
          const next = `${requestUrl.pathname}${requestUrl.search}`;
          response.statusCode = 302;
          response.setHeader("Location", `/?next=${encodeURIComponent(next)}`);
          response.end();
          return;
        }
        if (await serveWebFile("/index.html", webDirectory, response, true)) return;
        sendJson(response, 503, { error: "The hosted session viewer has not been built." });
        return;
      }

      if (method !== "GET") {
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid request." });
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (requestUrl.pathname !== "/api/agent") {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    if (!authorized(request, expectedDeviceTokenDigest)) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    let deviceId: string | null = null;
    const helloTimeout = setTimeout(() => socket.close(1008, "Agent hello required"), 5_000);

    function sendMessage(message: ServerMessage): void {
      socket.send(JSON.stringify(message));
    }

    socket.on("pong", () => {
      if (!deviceId) return;
      const managed = devices.get(deviceId);
      if (managed?.socket === socket) managed.alive = true;
    });

    socket.on("message", (data: RawData) => {
      let value: unknown;
      try {
        value = JSON.parse(data.toString());
      } catch {
        sendMessage({ type: "server.error", code: "invalid-message", message: "Messages must be valid JSON." });
        socket.close(1008, "Invalid message");
        return;
      }

      const parsed = AgentMessageSchema.safeParse(value);
      if (!parsed.success) {
        sendMessage({ type: "server.error", code: "invalid-message", message: "Message does not match live protocol v1." });
        socket.close(1008, "Invalid message");
        return;
      }

      if (parsed.data.type === "agent.hello") {
        if (deviceId) {
          socket.close(1008, "Agent already registered");
          return;
        }
        clearTimeout(helloTimeout);
        const registeredDeviceId = parsed.data.device.id;
        deviceId = registeredDeviceId;
        const now = new Date().toISOString();
        const existing = devices.get(registeredDeviceId);
        if (!existing && devices.size >= maxDevices) {
          sendMessage({
            type: "server.error",
            code: "capacity-exceeded",
            message: "This Tracks Server cannot accept another device connection.",
          });
          socket.close(1013, "Device capacity reached");
          return;
        }
        if (existing) {
          rejectPendingRequests(existing, new DeviceOfflineError("The device connection was replaced."));
          existing.socket.send(JSON.stringify({
            type: "server.error",
            code: "device-replaced",
            message: "A newer connection replaced this device connection.",
          } satisfies ServerMessage));
          existing.socket.close(4001, "Device replaced");
        }
        devices.set(registeredDeviceId, {
          descriptor: parsed.data.device,
          connectedAt: now,
          lastSeenAt: now,
          alive: true,
          socket,
          pendingRequests: new Map(),
        });
        sendMessage({
          type: "server.welcome",
          protocolVersion: LIVE_PROTOCOL_VERSION,
          connectedAt: now,
          heartbeatIntervalMs,
        });
        publishDevices();
        publishRelayEvent(registeredDeviceId, "device.status", { online: true, at: now });
        return;
      }

      if (!deviceId) {
        socket.close(1008, "Agent hello required");
        return;
      }
      const managed = devices.get(deviceId);
      if (managed?.socket !== socket) return;
      managed.lastSeenAt = new Date().toISOString();
      managed.alive = true;

      if (parsed.data.type === "agent.response") {
        const pending = managed.pendingRequests.get(parsed.data.requestId);
        if (!pending) return;
        managed.pendingRequests.delete(parsed.data.requestId);
        clearTimeout(pending.timeout);
        if (parsed.data.ok) pending.resolve(parsed.data.payload);
        else pending.reject(new Error(parsed.data.error));
        return;
      }

      if (parsed.data.type === "agent.invalidate") {
        publishRelayEvent(deviceId, "catalog.updated", {
          scope: parsed.data.scope,
          trackId: parsed.data.trackId ?? null,
          at: parsed.data.at,
        });
        return;
      }

      if (parsed.data.type === "agent.share.create") {
        const created = createShare(deviceId, parsed.data.trackId);
        sendMessage({
          type: "server.share.created",
          requestId: parsed.data.requestId,
          shareId: created.share.id,
          path: created.path,
          viewerSecret: created.viewerSecret,
        });
        return;
      }

      publishDevices();
    });

    socket.once("close", () => {
      clearTimeout(helloTimeout);
      if (!deviceId) return;
      const managed = devices.get(deviceId);
      if (managed?.socket === socket) {
        rejectPendingRequests(managed, new DeviceOfflineError("The source device disconnected."));
        devices.delete(deviceId);
        publishDevices();
        publishRelayEvent(deviceId, "device.status", {
          online: false,
          at: new Date().toISOString(),
        });
      }
    });
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of ownerSessions) {
      if (session.expiresAt <= now) ownerSessions.delete(key);
    }
    for (const managed of devices.values()) {
      if (!managed.alive) {
        managed.socket.terminate();
        continue;
      }
      managed.alive = false;
      managed.socket.ping();
    }
    for (const client of eventClients) {
      if (!client.write(": heartbeat\n\n")) {
        eventClients.delete(client);
        client.end();
      }
    }
    for (const client of relayEventClients) {
      if (!client.response.write(": heartbeat\n\n")) {
        relayEventClients.delete(client);
        client.response.end();
      }
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });

  const address = server.address() as AddressInfo;
  const displayHost = host.includes(":") ? `[${host}]` : host;
  return {
    url: `http://${displayHost}:${address.port}`,
    close: async () => {
      clearInterval(heartbeat);
      for (const client of eventClients) client.end();
      eventClients.clear();
      for (const client of relayEventClients) client.response.end();
      relayEventClients.clear();
      for (const managed of devices.values()) {
        rejectPendingRequests(managed, new DeviceOfflineError("Tracks Server is shutting down."));
        managed.socket.terminate();
      }
      devices.clear();
      webSocketServer.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}
