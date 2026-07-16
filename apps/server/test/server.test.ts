import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrackLibrarySchema, TrackSchema } from "@tracks/core-model";
import { afterEach, describe, expect, it } from "vitest";
import { startTracksServer, type RunningTracksServer } from "../src/index.js";

const temporaryRoots: string[] = [];
const servers: RunningTracksServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createSource(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tracks-server-fixture-"));
  temporaryRoots.push(root);
  const project = join(root, "example-project");
  await mkdir(project);
  await writeFile(
    join(project, "session.jsonl"),
    `${JSON.stringify({
      type: "user",
      sessionId: "server-fixture",
      uuid: "user-1",
      timestamp: "2026-07-16T08:00:00.000Z",
      cwd: "/workspace/example",
      message: { content: "Review this session." },
    })}\n`,
    "utf8",
  );
  return root;
}

describe("Tracks loopback server", () => {
  it("serves health, library, and bounded track data", async () => {
    const sourceRoot = await createSource();
    const server = await startTracksServer({ sourceRoot, staticDirectory: false });
    servers.push(server);

    const health = await fetch(`${server.url}/api/health`).then((response) => response.json());
    expect(health).toMatchObject({ ok: true, trackCount: 1 });

    const library = TrackLibrarySchema.parse(
      await fetch(`${server.url}/api/tracks`).then((response) => response.json()),
    );
    expect(library.tracks).toHaveLength(1);
    const trackId = library.tracks[0]?.id;
    expect(trackId).toBeDefined();
    if (!trackId) return;

    const track = TrackSchema.parse(
      await fetch(
        `${server.url}/api/tracks/${encodeURIComponent(trackId)}`,
      ).then((response) => response.json()),
    );
    expect(track.entries).toHaveLength(1);
    expect(track.entries[0]).toMatchObject({ kind: "message", role: "user" });
  });

  it("rejects non-local origins", async () => {
    const sourceRoot = await createSource();
    const server = await startTracksServer({ sourceRoot, staticDirectory: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/health`, {
      headers: { Origin: "https://example.com" },
    });
    expect(response.status).toBe(403);
  });
});
