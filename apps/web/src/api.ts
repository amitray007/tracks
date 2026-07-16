import {
  TrackLibrarySchema,
  TrackSchema,
  type Track,
  type TrackLibrary,
} from "@tracks/core-model";

export interface TrackLibraryResponse extends TrackLibrary {
  total: number;
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
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
): Promise<Track> {
  const query = new URLSearchParams({
    start: String(startSequence),
    limit: String(limit),
  });
  const value = await fetchJson(
    `/api/tracks/${encodeURIComponent(trackId)}?${query}`,
  );
  const parsed = TrackSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("The local service returned an invalid track payload.");
  }
  return parsed.data;
}
