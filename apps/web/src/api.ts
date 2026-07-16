import {
  TrackLibrarySchema,
  TrackSchema,
  type Track,
  type TrackLibrary,
} from "@tracks/core-model";

export interface TrackLibraryResponse extends TrackLibrary {
  total: number;
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

export async function getTrackLibrary(refresh = false): Promise<TrackLibraryResponse> {
  const query = new URLSearchParams({ limit: "500" });
  if (refresh) query.set("refresh", "1");
  const value = await fetchJson(`/api/tracks?${query}`);
  const parsed = TrackLibrarySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("The local service returned an invalid track library.");
  }

  const total = typeof value === "object" && value && "total" in value
    && typeof value.total === "number"
    ? value.total
    : parsed.data.tracks.length;
  return { ...parsed.data, total };
}

export async function getTrack(
  trackId: string,
  startSequence = 0,
  limit = 250,
  signal?: AbortSignal,
): Promise<Track> {
  const query = new URLSearchParams({
    start: String(startSequence),
    limit: String(limit),
  });
  const value = await fetchJson(`/api/tracks/${encodeURIComponent(trackId)}?${query}`, signal);
  const parsed = TrackSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("The local service returned an invalid track payload.");
  }
  return parsed.data;
}

function mergeDiagnostics(first: Track["diagnostics"], second: Track["diagnostics"]): Track["diagnostics"] {
  const seen = new Set<string>();
  return [...first, ...second].filter((diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.approximateLine ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getCompleteTrack(
  trackId: string,
  options: {
    signal?: AbortSignal;
    onProgress?(track: Track): void;
  } = {},
): Promise<Track> {
  let combined: Track | null = null;
  let startSequence = 0;
  const visited = new Set<number>();

  while (!visited.has(startSequence)) {
    visited.add(startSequence);
    const page = await getTrack(trackId, startSequence, 2_000, options.signal);
    combined = combined
      ? {
          ...page,
          entries: [...combined.entries, ...page.entries],
          diagnostics: mergeDiagnostics(combined.diagnostics, page.diagnostics),
        }
      : page;
    options.onProgress?.(combined);
    if (!page.truncated || page.nextSequence === null) break;
    startSequence = page.nextSequence;
  }

  if (!combined) throw new Error("The local service returned an empty track payload.");
  return combined;
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
