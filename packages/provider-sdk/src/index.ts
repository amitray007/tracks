import type { Track, TrackSummary } from "@tracks/core-model";

export interface ProviderTrackDescriptor<TReference = unknown> {
  summary: TrackSummary;
  reference: TReference;
}

export interface ProviderScanResult<TReference = unknown> {
  tracks: Array<ProviderTrackDescriptor<TReference>>;
  scannedAt: string;
  sourceState: "ready" | "missing" | "unreadable";
  sourceMessage: string | null;
}

export interface LoadTrackOptions {
  entryLimit: number;
  startSequence?: number;
  direction?: "forward" | "backward";
  beforeSequence?: number;
}

export interface ProviderAdapter<TReference = unknown> {
  readonly id: string;
  readonly displayName: string;
  scan(): Promise<ProviderScanResult<TReference>>;
  loadTrack(
    descriptor: ProviderTrackDescriptor<TReference>,
    options: LoadTrackOptions,
  ): Promise<Track>;
}

export function sortTracksByUpdatedAt<TReference>(
  tracks: Array<ProviderTrackDescriptor<TReference>>,
): Array<ProviderTrackDescriptor<TReference>> {
  return [...tracks].sort(
    (left, right) =>
      Date.parse(right.summary.updatedAt) - Date.parse(left.summary.updatedAt),
  );
}
