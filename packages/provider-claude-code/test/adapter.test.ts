import { appendFile, mkdtemp, mkdir, copyFile, writeFile } from "node:fs/promises";
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

  it("returns bounded pages from the latest end without reversing provider order", async () => {
    const sourceRoot = await createSource();
    const adapter = new ClaudeCodeAdapter({ sourceRoot });
    const result = await adapter.scan();
    const descriptor = result.tracks[0];

    expect(descriptor).toBeDefined();
    if (!descriptor) return;

    const latest = await adapter.loadTrack(descriptor, {
      direction: "backward",
      entryLimit: 3,
    });
    expect(latest.entries.map((entry) => entry.sequence)).toEqual([4, 5, 6]);
    expect(latest.summary.entryCount).toBe(7);
    expect(latest.truncated).toBe(true);
    expect(latest.nextSequence).toBeNull();

    const previous = await adapter.loadTrack(descriptor, {
      direction: "backward",
      beforeSequence: 4,
      entryLimit: 3,
    });
    expect(previous.entries.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    expect(previous.truncated).toBe(true);
  });

  it("normalizes Claude task notifications as linked agent results", async () => {
    const sourceRoot = await createSource();
    const sessionPath = join(sourceRoot, "example-project", "fixture-session.jsonl");
    await appendFile(
      sessionPath,
      [
        JSON.stringify({
          type: "assistant",
          sessionId: "fixture-session",
          uuid: "agent-call",
          timestamp: "2026-07-16T08:00:10.000Z",
          message: {
            content: [{
              type: "tool_use",
              id: "toolu-agent",
              name: "Task",
              input: { description: "Inspect the project" },
            }],
          },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "fixture-session",
          uuid: "literal-xml",
          timestamp: "2026-07-16T08:00:10.500Z",
          message: {
            content: "Keep this code: <widget mode=\"compact\">content</widget>",
          },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "fixture-session",
          uuid: "agent-notification",
          timestamp: "2026-07-16T08:00:11.000Z",
          message: {
            content: [
              "<task-notification>",
              "<task-id>task-1</task-id>",
              "<tool-use-id>toolu-agent</tool-use-id>",
              "<output-file>/tmp/task-1.output</output-file>",
              "<status>completed</status>",
              "<summary>Repository inspection complete</summary>",
              "<result>Found the relevant implementation.</result>",
              "<usage><subagent_tokens>128015</subagent_tokens><tool_uses>37</tool_uses><duration_ms>206951</duration_ms></usage>",
              "</task-notification>",
            ].join("\n"),
          },
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const adapter = new ClaudeCodeAdapter({ sourceRoot });
    const descriptor = (await adapter.scan()).tracks[0];
    expect(descriptor).toBeDefined();
    if (!descriptor) return;

    const track = await adapter.loadTrack(descriptor, { entryLimit: 100 });
    const agentResult = track.entries.find((entry) =>
      entry.kind === "tool_result" && entry.toolUseId === "toolu-agent"
    );
    expect(agentResult).toMatchObject({
      kind: "tool_result",
      isError: false,
      content: {
        text: "Found the relevant implementation.",
        summary: "Repository inspection complete",
        status: "completed",
        taskId: "task-1",
        usage: {
          subagentTokens: 128015,
          toolUses: 37,
          durationMs: 206951,
        },
      },
    });
    expect(track.entries.some((entry) =>
      entry.kind === "message" && entry.text.includes("<task-notification>"),
    )).toBe(false);
    expect(track.entries.some((entry) =>
      entry.kind === "message" && entry.text.includes("<widget mode=\"compact\">")
    )).toBe(true);
  });
});
