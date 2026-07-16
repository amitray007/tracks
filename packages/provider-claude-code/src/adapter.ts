import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Track } from "@tracks/core-model";
import type {
  LoadTrackOptions,
  ProviderAdapter,
  ProviderScanResult,
  ProviderTrackDescriptor,
} from "@tracks/provider-sdk";
import { sortTracksByUpdatedAt } from "@tracks/provider-sdk";
import {
  discoverClaudeTracks,
  type ClaudeEvidenceCache,
  type ClaudeTrackReference,
} from "./discovery.js";
import { parseClaudeTrack } from "./parser.js";

export interface ClaudeCodeAdapterOptions {
  sourceRoot?: string;
}

export class ClaudeCodeAdapter implements ProviderAdapter<ClaudeTrackReference> {
  readonly id = "claude-code";
  readonly displayName = "Claude Code";
  readonly sourceRoot: string;
  readonly evidenceCache: ClaudeEvidenceCache = new Map();

  constructor(options: ClaudeCodeAdapterOptions = {}) {
    this.sourceRoot = options.sourceRoot ?? join(homedir(), ".claude", "projects");
  }

  async scan(): Promise<ProviderScanResult<ClaudeTrackReference>> {
    try {
      await access(this.sourceRoot, constants.R_OK);
    } catch {
      return {
        tracks: [],
        scannedAt: new Date().toISOString(),
        sourceState: "missing",
        sourceMessage: "Claude Code projects were not found or are not readable.",
      };
    }

    try {
      const tracks = await discoverClaudeTracks(this.sourceRoot, this.evidenceCache);
      return {
        tracks: sortTracksByUpdatedAt(tracks),
        scannedAt: new Date().toISOString(),
        sourceState: "ready",
        sourceMessage: null,
      };
    } catch {
      return {
        tracks: [],
        scannedAt: new Date().toISOString(),
        sourceState: "unreadable",
        sourceMessage: "Tracks could not scan the configured Claude Code source.",
      };
    }
  }

  async loadTrack(
    descriptor: ProviderTrackDescriptor<ClaudeTrackReference>,
    options: LoadTrackOptions,
  ): Promise<Track> {
    return parseClaudeTrack(descriptor.summary, descriptor.reference, options);
  }
}
