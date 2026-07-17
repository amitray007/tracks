import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  AgentMessageSchema,
  LIVE_PROTOCOL_VERSION,
  type ConnectedDevice,
  type ConnectedDevicesResponse,
  type DeviceDescriptor,
  type ServerMessage,
} from "@tracks/live-protocol";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { DASHBOARD_CSS, DASHBOARD_HTML, DASHBOARD_JS } from "./dashboard.js";

const MINIMUM_TOKEN_LENGTH = 32;
const DEFAULT_MAX_DEVICES = 256;
const DEFAULT_MAX_EVENT_CLIENTS = 64;

export interface TracksCloudOptions {
  host?: string;
  port?: number;
  token: string;
  heartbeatIntervalMs?: number;
  maxDevices?: number;
  maxEventClients?: number;
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
}

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

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
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

export async function startTracksCloud(options: TracksCloudOptions): Promise<RunningTracksCloud> {
  if (options.token.length < MINIMUM_TOKEN_LENGTH) {
    throw new Error(`TRACKS_CLOUD_TOKEN must contain at least ${MINIMUM_TOKEN_LENGTH} characters.`);
  }

  const host = options.host ?? "127.0.0.1";
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  if (heartbeatIntervalMs < 1_000 || heartbeatIntervalMs > 120_000) {
    throw new Error("heartbeatIntervalMs must be between 1000 and 120000.");
  }
  const maxDevices = options.maxDevices ?? DEFAULT_MAX_DEVICES;
  const maxEventClients = options.maxEventClients ?? DEFAULT_MAX_EVENT_CLIENTS;
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || !Number.isInteger(maxEventClients) || maxEventClients < 1) {
    throw new Error("Connection limits must be positive integers.");
  }
  const expectedTokenDigest = tokenDigest(options.token);
  const devices = new Map<string, ManagedDevice>();
  const eventClients = new Set<ServerResponse>();
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const startedAt = Date.now();

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

  const server = createServer((request, response) => {
    setSecurityHeaders(response);
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    if (requestUrl.pathname === "/") {
      send(response, 200, "text/html; charset=utf-8", DASHBOARD_HTML);
      return;
    }
    if (requestUrl.pathname === "/dashboard.css") {
      send(response, 200, "text/css; charset=utf-8", DASHBOARD_CSS);
      return;
    }
    if (requestUrl.pathname === "/dashboard.js") {
      send(response, 200, "text/javascript; charset=utf-8", DASHBOARD_JS);
      return;
    }
    if (requestUrl.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        service: "tracks-cloud",
        protocolVersion: LIVE_PROTOCOL_VERSION,
        connectedDevices: devices.size,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1_000),
      });
      return;
    }
    if (requestUrl.pathname === "/api/devices") {
      if (!authorized(request, expectedTokenDigest)) {
        sendJson(response, 401, { error: "Server access token required." });
        return;
      }
      sendJson(response, 200, connectedDevices());
      return;
    }
    if (requestUrl.pathname === "/api/events") {
      if (!authorized(request, expectedTokenDigest)) {
        sendJson(response, 401, { error: "Server access token required." });
        return;
      }
      if (eventClients.size >= maxEventClients) {
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

    sendJson(response, 404, { error: "Not found." });
  });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (requestUrl.pathname !== "/api/agent") {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    if (!authorized(request, expectedTokenDigest)) {
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
        });
        sendMessage({
          type: "server.welcome",
          protocolVersion: LIVE_PROTOCOL_VERSION,
          connectedAt: now,
          heartbeatIntervalMs,
        });
        publishDevices();
        return;
      }

      if (!deviceId) {
        socket.close(1008, "Agent hello required");
        return;
      }
      const managed = devices.get(deviceId);
      if (managed?.socket === socket) {
        managed.lastSeenAt = new Date().toISOString();
        managed.alive = true;
        publishDevices();
      }
    });

    socket.once("close", () => {
      clearTimeout(helloTimeout);
      if (!deviceId) return;
      if (devices.get(deviceId)?.socket === socket) {
        devices.delete(deviceId);
        publishDevices();
      }
    });
  });

  const heartbeat = setInterval(() => {
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
      for (const managed of devices.values()) managed.socket.terminate();
      devices.clear();
      webSocketServer.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}
