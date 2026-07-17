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

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });

  const value: unknown = await response.json();
  if (!response.ok) {
    const message = typeof value === "object" && value && "error" in value
      ? String(value.error)
      : `Tracks request failed with ${response.status}`;
    throw new Error(message);
  }
  return value;
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
  const value = await fetchJson(`/api/tracks?${query}`);
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
    `/api/tracks/${encodeURIComponent(trackId)}?${query}`,
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
  const value = await fetchJson("/api/viewer");
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
