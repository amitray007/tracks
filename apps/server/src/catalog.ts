import type { Track, TrackLibrary } from "@tracks/core-model";
import type { ProviderTrackDescriptor } from "@tracks/provider-sdk";
import {
  ClaudeCodeAdapter,
  type ClaudeTrackReference,
} from "@tracks/provider-claude-code";

export interface TrackCatalogOptions {
  sourceRoot?: string;
}

export class TrackCatalog {
  readonly adapter: ClaudeCodeAdapter;
  #descriptors = new Map<string, ProviderTrackDescriptor<ClaudeTrackReference>>();
  #library: TrackLibrary | null = null;
  #refreshPromise: Promise<TrackLibrary> | null = null;

  constructor(options: TrackCatalogOptions = {}) {
    this.adapter = new ClaudeCodeAdapter(options);
  }

  async refresh(): Promise<TrackLibrary> {
    if (this.#refreshPromise) {
      return this.#refreshPromise;
    }

    this.#refreshPromise = this.#performRefresh();
    try {
      return await this.#refreshPromise;
    } finally {
      this.#refreshPromise = null;
    }
  }

  async #performRefresh(): Promise<TrackLibrary> {
    const result = await this.adapter.scan();
    this.#descriptors = new Map(result.tracks.map((track) => [track.summary.id, track]));
    this.#library = {
      tracks: result.tracks.map((track) => track.summary),
      scannedAt: result.scannedAt,
      sourceState: result.sourceState,
      sourceMessage: result.sourceMessage,
    };
    return this.#library;
  }

  async library(options: { query?: string; limit?: number; offset?: number; refresh?: boolean } = {}) {
    const library = !this.#library || options.refresh ? await this.refresh() : this.#library;
    const query = options.query?.trim().toLocaleLowerCase();
    const maximum = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const tracks = query
      ? library.tracks.filter((track) =>
          [track.title, track.projectLabel, track.providerLabel].some((value) =>
            value.toLocaleLowerCase().includes(query),
          ),
        )
      : library.tracks;

    return {
      ...library,
      tracks: tracks.slice(offset, offset + maximum),
      total: tracks.length,
      offset,
      nextOffset: offset + maximum < tracks.length ? offset + maximum : null,
    };
  }

  async loadTrack(
    trackId: string,
    entryLimit = 500,
    startSequence = 0,
    direction: "forward" | "backward" = "forward",
    beforeSequence?: number,
  ): Promise<Track | null> {
    if (!this.#library) {
      await this.refresh();
    }

    const descriptor = this.#descriptors.get(trackId);
    if (!descriptor) {
      return null;
    }

    return this.adapter.loadTrack(descriptor, {
      entryLimit: Math.min(Math.max(entryLimit, 1), 2_000),
      ...(direction === "forward"
        ? { direction: "forward" as const, startSequence: Math.max(startSequence, 0) }
        : {
            direction: "backward" as const,
            ...(beforeSequence === undefined
              ? {}
              : { beforeSequence: Math.max(beforeSequence, 0) }),
          }),
    });
  }
}
