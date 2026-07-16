import { mkdtemp, mkdir, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { ClaudeCodeAdapter } from "../src/index.js";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "basic-session.jsonl",
);

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createSource(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tracks-claude-fixture-"));
  temporaryRoots.push(root);
  const project = join(root, "example-project");
  await mkdir(project);
  await copyFile(fixturePath, join(project, "fixture-session.jsonl"));

  const nested = join(project, "fixture-session", "subagents");
  await mkdir(nested, { recursive: true });
  await writeFile(join(nested, "agent-1.jsonl"), "{}\n", "utf8");
  return root;
}

describe("ClaudeCodeAdapter", () => {
  it("discovers only project session files and derives bounded metadata", async () => {
    const sourceRoot = await createSource();
    const adapter = new ClaudeCodeAdapter({ sourceRoot });
    const result = await adapter.scan();

    expect(result.sourceState).toBe("ready");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]?.summary).toMatchObject({
      projectLabel: "example",
      title: "Please inspect the project without changing files.",
    });
    expect(result.tracks[0]?.summary.id).toMatch(/^claude:[a-f0-9]{24}:fixture-session$/);
  });

  it("normalizes known blocks and retains unknown or malformed records", async () => {
    const sourceRoot = await createSource();
    const adapter = new ClaudeCodeAdapter({ sourceRoot });
    const result = await adapter.scan();
    const descriptor = result.tracks[0];

    expect(descriptor).toBeDefined();
    if (!descriptor) return;

    const track = await adapter.loadTrack(descriptor, { entryLimit: 100 });
    expect(track.entries.map((entry) => entry.kind)).toEqual([
      "message",
      "reasoning",
      "tool_call",
      "tool_result",
      "message",
      "unsupported",
      "unsupported",
    ]);
    expect(track.diagnostics).toHaveLength(1);
    expect(track.truncated).toBe(false);
  });

  it("returns a bounded slice for large tracks", async () => {
    const sourceRoot = await createSource();
    const adapter = new ClaudeCodeAdapter({ sourceRoot });
    const result = await adapter.scan();
    const descriptor = result.tracks[0];

    expect(descriptor).toBeDefined();
    if (!descriptor) return;

    const track = await adapter.loadTrack(descriptor, { entryLimit: 3 });
    expect(track.entries).toHaveLength(3);
    expect(track.truncated).toBe(true);
    expect(track.nextSequence).toBe(3);
  });
});
