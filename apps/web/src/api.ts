import {
  TrackLibrarySchema,
  TrackSchema,
  type Track,
  type TrackLibrary,
} from "@tracks/core-model";

export interface TrackLibraryResponse extends TrackLibrary {
  total: number;
  offset: number;
  nextOffset: number | null;
}

export type TracksSurface = "local" | "cloud-device" | "live-share";

export interface RemoteConnectionSnapshot {
  configured: boolean;
  connected: boolean;
  serverUrl: string | null;
  deviceId: string | null;
  lastError: string | null;
}

export interface RuntimeContext {
  surface: TracksSurface;
  online: boolean;
  trackId?: string;
  deviceId?: string;
  deviceName?: string | null;
  remote?: RemoteConnectionSnapshot;
}

interface ApiRoute {
  base: string;
  headers: Record<string, string>;
  surface: TracksSurface;
}

function apiRoute(): ApiRoute {
  const deviceMatch = window.location.pathname.match(/^\/device\/([^/]+)/);
  if (deviceMatch) {
    return {
      base: `/api/devices/${encodeURIComponent(decodeURIComponent(deviceMatch[1]!))}`,
      headers: {},
      surface: "cloud-device",
    };
  }
  const shareMatch = window.location.pathname.match(/^\/s\/([^/]+)/);
  if (shareMatch) {
    const secret = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    return {
      base: `/api/shares/${encodeURIComponent(decodeURIComponent(shareMatch[1]!))}`,
      headers: secret ? { "X-Tracks-Share-Token": secret } : {},
      surface: "live-share",
    };
  }
  return { base: "/api", headers: {}, surface: "local" };
}

function apiPath(path: string): string {
  return `${apiRoute().base}${path}`;
}

async function fetchJson(
  path: string,
  signal?: AbortSignal,
  init: Pick<RequestInit, "method" | "body"> = {},
): Promise<unknown> {
  const route = apiRoute();
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...route.headers,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });

  const value: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 401 && route.surface === "cloud-device") {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/?next=${encodeURIComponent(next)}`);
    }
    const message = typeof value === "object" && value && "error" in value
      ? String(value.error)
      : `Tracks request failed with ${response.status}`;
    throw new Error(message);
  }
  return value;
}

export async function getRuntimeContext(): Promise<RuntimeContext> {
  const route = apiRoute();
  const value = await fetchJson(`${route.base}/context`);
  if (!value || typeof value !== "object") throw new Error("Tracks returned an invalid runtime context.");
  const record = value as Record<string, unknown>;
  const surface = record.surface === "cloud-device" || record.surface === "live-share"
    ? record.surface
    : "local";
  const context = record as unknown as Partial<RuntimeContext>;
  return {
    ...context,
    surface,
    online: record.online !== false,
  };
}

export async function getTrackLibrary(options: {
  refresh?: boolean;
  query?: string;
  offset?: number;
  limit?: number;
} = {}): Promise<TrackLibraryResponse> {
  const query = new URLSearchParams({
    limit: String(options.limit ?? 60),
    offset: String(options.offset ?? 0),
  });
  if (options.refresh) query.set("refresh", "1");
  if (options.query?.trim()) query.set("q", options.query.trim());
  const value = await fetchJson(`${apiPath("/tracks")}?${query}`);
  const parsed = TrackLibrarySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("The local service returned an invalid track library.");
  }

  const total = typeof value === "object" && value && "total" in value
    && typeof value.total === "number"
    ? value.total
    : parsed.data.tracks.length;
  const offset = typeof value === "object" && value && "offset" in value
    && typeof value.offset === "number"
    ? value.offset
    : options.offset ?? 0;
  const nextOffset = typeof value === "object" && value && "nextOffset" in value
    && (typeof value.nextOffset === "number" || value.nextOffset === null)
    ? value.nextOffset
    : offset + parsed.data.tracks.length < total
      ? offset + parsed.data.tracks.length
      : null;
  return { ...parsed.data, total, offset, nextOffset };
}

export async function getTrackPage(
  trackId: string,
  options: {
    startSequence?: number;
    beforeSequence?: number;
    direction?: "forward" | "backward";
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<Track> {
  const query = new URLSearchParams({
    limit: String(options.limit ?? 120),
  });
  if (options.direction === "backward") query.set("direction", "backward");
  if (options.beforeSequence !== undefined) query.set("before", String(options.beforeSequence));
  else query.set("start", String(options.startSequence ?? 0));
  const value = await fetchJson(
    `${apiPath("/tracks")}/${encodeURIComponent(trackId)}?${query}`,
    options.signal,
  );
  const parsed = TrackSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("The local service returned an invalid track payload.");
  }
  return parsed.data;
}

export interface ViewerIdentity {
  login: string | null;
  name: string | null;
  avatarUrl: string | null;
  source: "github-cli" | "fallback";
}

export async function getViewerIdentity(): Promise<ViewerIdentity> {
  const value = await fetchJson(apiPath("/viewer"));
  if (!value || typeof value !== "object") {
    throw new Error("The local service returned an invalid viewer identity.");
  }
  const record = value as Record<string, unknown>;
  return {
    login: typeof record.login === "string" ? record.login : null,
    name: typeof record.name === "string" ? record.name : null,
    avatarUrl: typeof record.avatarUrl === "string" ? record.avatarUrl : null,
    source: record.source === "github-cli" ? "github-cli" : "fallback",
  };
}

export async function createLiveSessionShare(trackId: string): Promise<{ url: string }> {
  const route = apiRoute();
  if (route.surface === "live-share") throw new Error("A live share cannot create another share.");
  const value = await fetchJson(`${route.base}/shares`, undefined, {
    method: "POST",
    body: JSON.stringify({ trackId }),
  });
  if (!value || typeof value !== "object") throw new Error("Tracks returned an invalid live link.");
  const record = value as Record<string, unknown>;
  if (typeof record.url === "string") return { url: record.url };
  if (typeof record.path === "string" && typeof record.viewerSecret === "string") {
    const url = new URL(record.path, window.location.origin);
    url.hash = record.viewerSecret;
    return { url: url.toString() };
  }
  throw new Error("Tracks returned an incomplete live link.");
}

export async function logoutTracksOwner(): Promise<void> {
  if (apiRoute().surface !== "cloud-device") {
    throw new Error("Owner sign-out is available only in the server device viewer.");
  }
  await fetchJson("/api/auth/logout", undefined, { method: "POST" });
}

function parseRemoteConnectionSnapshot(value: unknown): RemoteConnectionSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Tracks returned an invalid server connection state.");
  }
  const record = value as Record<string, unknown>;
  return {
    configured: record.configured === true,
    connected: record.connected === true,
    serverUrl: typeof record.serverUrl === "string" ? record.serverUrl : null,
    deviceId: typeof record.deviceId === "string" ? record.deviceId : null,
    lastError: typeof record.lastError === "string" ? record.lastError : null,
  };
}

export async function connectTracksServer(input?: {
  serverUrl: string;
  token: string;
}): Promise<RemoteConnectionSnapshot> {
  if (apiRoute().surface !== "local") throw new Error("Server connection settings are available only in the local viewer.");
  const value = await fetchJson("/api/remote/connect", undefined, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
  return parseRemoteConnectionSnapshot(value);
}

export async function disconnectTracksServer(forget = false): Promise<RemoteConnectionSnapshot> {
  if (apiRoute().surface !== "local") throw new Error("Server connection settings are available only in the local viewer.");
  const value = await fetchJson("/api/remote/disconnect", undefined, {
    method: "POST",
    body: JSON.stringify({ forget }),
  });
  return parseRemoteConnectionSnapshot(value);
}

export interface LiveEvent {
  event: string;
  data: unknown;
}

export async function subscribeToLiveEvents(options: {
  signal: AbortSignal;
  onOpen(): void;
  onEvent(event: LiveEvent): void;
  onError(): void;
}): Promise<void> {
  const route = apiRoute();
  while (!options.signal.aborted) {
    try {
      const response = await fetch(`${route.base}/events`, {
        headers: { Accept: "text/event-stream", ...route.headers },
        cache: "no-store",
        signal: options.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Live stream failed with ${response.status}`);
      options.onOpen();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!options.signal.aborted) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          let event = "message";
          const data: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data.push(line.slice(5).trim());
          }
          if (data.length > 0) {
            const raw = data.join("\n");
            let parsed: unknown = raw;
            try { parsed = JSON.parse(raw); } catch { /* Keep textual event data. */ }
            options.onEvent({ event, data: parsed });
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch {
      if (options.signal.aborted) return;
      options.onError();
    }
    if (!options.signal.aborted) {
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 1_500);
        options.signal.addEventListener("abort", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
  }
}
