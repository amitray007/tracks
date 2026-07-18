import { randomUUID } from "node:crypto";
import type { TrackCatalog, TracksRemoteBridge, RemoteConnectionSnapshot } from "@tracks/server";
import {
  AgentMessageSchema,
  LIVE_PROTOCOL_VERSION,
  ServerMessageSchema,
  type AgentMessage,
  type ServerRequest,
  type ServerShareCreated,
} from "@tracks/live-protocol";
import WebSocket, { type RawData } from "ws";

const MAX_RESPONSE_BYTES = 3_500_000;

export interface HostedConnectorOptions {
  serverUrl: string;
  token: string;
  device: {
    id: string;
    name: string;
  };
  catalog: TrackCatalog;
  onStatus(snapshot: RemoteConnectionSnapshot): void;
}

interface PendingShare {
  resolve(value: { url: string }): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

export class HostedConnector implements TracksRemoteBridge {
  readonly #options: HostedConnectorOptions;
  #socket: WebSocket | null = null;
  #stopped = true;
  #connected = false;
  #lastError: string | null = null;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #pendingShares = new Map<string, PendingShare>();

  constructor(options: HostedConnectorOptions) {
    this.#options = options;
  }

  snapshot(): RemoteConnectionSnapshot {
    return {
      configured: true,
      connected: this.#connected,
      serverUrl: this.#options.serverUrl,
      deviceId: this.#options.device.id,
      lastError: this.#lastError,
    };
  }

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#connect();
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#clearHeartbeat();
    const socket = this.#socket;
    this.#socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1_000);
        socket.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.close(1000, "Tracks agent stopped");
      });
    }
    this.#connected = false;
    for (const pending of this.#pendingShares.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("The Tracks Server connection stopped."));
    }
    this.#pendingShares.clear();
    this.#emitStatus();
  }

  notifyCatalogUpdated(event: { scannedAt: string }): void {
    this.#send({
      type: "agent.invalidate",
      scope: "catalog",
      at: event.scannedAt,
    });
  }

  createSessionShare(trackId: string): Promise<{ url: string }> {
    if (!this.#connected || this.#socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("This device is not connected to Tracks Server."));
    }
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingShares.delete(requestId);
        reject(new Error("Tracks Server did not create the live link in time."));
      }, 10_000);
      timeout.unref();
      this.#pendingShares.set(requestId, { resolve, reject, timeout });
      this.#send({ type: "agent.share.create", requestId, trackId });
    });
  }

  #connect(): void {
    if (this.#stopped) return;
    let endpoint: URL;
    try {
      endpoint = new URL("/api/agent", this.#options.serverUrl);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    } catch {
      this.#lastError = "The configured Tracks Server URL is invalid.";
      this.#emitStatus();
      return;
    }

    const socket = new WebSocket(endpoint, {
      headers: { Authorization: `Bearer ${this.#options.token}` },
      maxPayload: 4 * 1024 * 1024,
    });
    this.#socket = socket;
    socket.once("open", () => {
      if (this.#socket !== socket || this.#stopped) return;
      this.#send({
        type: "agent.hello",
        protocolVersion: LIVE_PROTOCOL_VERSION,
        device: {
          id: this.#options.device.id,
          name: this.#options.device.name,
          platform: `${process.platform}-${process.arch}`,
          version: "0.0.0",
          capabilities: ["library.page", "track.page", "track.subscribe"],
        },
      });
    });
    socket.on("message", (data: RawData) => this.#handleMessage(socket, data));
    socket.on("error", (error) => {
      if (this.#socket !== socket) return;
      this.#lastError = error.message;
      this.#emitStatus();
    });
    socket.once("close", (_code, reason) => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#connected = false;
      this.#clearHeartbeat();
      if (reason.byteLength > 0) this.#lastError = reason.toString();
      this.#emitStatus();
      this.#scheduleReconnect();
    });
  }

  #handleMessage(socket: WebSocket, data: RawData): void {
    if (this.#socket !== socket) return;
    let value: unknown;
    try {
      value = JSON.parse(data.toString());
    } catch {
      this.#lastError = "Tracks Server returned malformed data.";
      socket.close(1008, "Malformed server message");
      return;
    }
    const parsed = ServerMessageSchema.safeParse(value);
    if (!parsed.success) {
      this.#lastError = "Tracks Server returned an unsupported protocol message.";
      socket.close(1008, "Unsupported server message");
      return;
    }
    const message = parsed.data;
    if (message.type === "server.welcome") {
      this.#connected = true;
      this.#lastError = null;
      this.#reconnectAttempt = 0;
      this.#startHeartbeat(message.heartbeatIntervalMs);
      this.#emitStatus();
      return;
    }
    if (message.type === "server.request") {
      void this.#answerRequest(message);
      return;
    }
    if (message.type === "server.share.created") {
      this.#resolveShare(message);
      return;
    }
    this.#lastError = message.message;
    this.#emitStatus();
  }

  async #answerRequest(message: ServerRequest): Promise<void> {
    try {
      let payload: unknown;
      if (message.operation === "library.page") {
        payload = await this.#options.catalog.library({
          ...(message.parameters.query ? { query: message.parameters.query } : {}),
          limit: message.parameters.limit,
          offset: message.parameters.offset,
        });
      } else {
        payload = await this.#options.catalog.loadTrack(
          message.parameters.trackId,
          message.parameters.limit,
          message.parameters.startSequence ?? 0,
          message.parameters.direction,
          message.parameters.beforeSequence,
        );
        if (!payload) throw new Error("Track not found on the source device.");
      }
      const response = {
        type: "agent.response",
        requestId: message.requestId,
        ok: true,
        payload,
      } satisfies AgentMessage;
      const serialized = JSON.stringify(response);
      if (Buffer.byteLength(serialized) > MAX_RESPONSE_BYTES) {
        throw new Error("The requested page is too large to relay safely.");
      }
      this.#sendSerialized(serialized);
    } catch (error) {
      this.#send({
        type: "agent.response",
        requestId: message.requestId,
        ok: false,
        error: (error instanceof Error ? error.message : "Device request failed.").slice(0, 500),
      });
    }
  }

  #resolveShare(message: ServerShareCreated): void {
    const pending = this.#pendingShares.get(message.requestId);
    if (!pending) return;
    this.#pendingShares.delete(message.requestId);
    clearTimeout(pending.timeout);
    const url = new URL(message.path, this.#options.serverUrl);
    url.hash = message.viewerSecret;
    pending.resolve({ url: url.toString() });
  }

  #startHeartbeat(intervalMs: number): void {
    this.#clearHeartbeat();
    this.#heartbeat = setInterval(() => {
      this.#send({ type: "agent.heartbeat", sentAt: new Date().toISOString() });
    }, Math.max(1_000, Math.floor(intervalMs * 0.75)));
    this.#heartbeat.unref();
  }

  #clearHeartbeat(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
  }

  #scheduleReconnect(): void {
    if (this.#stopped || this.#reconnectTimer) return;
    const base = Math.min(10_000, 400 * (2 ** Math.min(this.#reconnectAttempt++, 5)));
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, delay);
    this.#reconnectTimer.unref();
  }

  #send(message: AgentMessage): void {
    const parsed = AgentMessageSchema.parse(message);
    this.#sendSerialized(JSON.stringify(parsed));
  }

  #sendSerialized(value: string): void {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(value);
  }

  #emitStatus(): void {
    this.#options.onStatus(this.snapshot());
  }
}
