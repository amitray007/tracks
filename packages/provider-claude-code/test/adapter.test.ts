import { appendFile, mkdtemp, mkdir, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { TrackSchema } from "@tracks/core-model";
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

  it("discovers validated subagent transcripts and links them to the parent invocation", async () => {
    const sourceRoot = await createSource();
    const projectRoot = join(sourceRoot, "example-project");
    const sessionPath = join(projectRoot, "fixture-session.jsonl");
    const agentId = "child-a1";
    const toolUseId = "toolu-child-a1";
    await writeFile(
      join(projectRoot, "fixture-session", "subagents", `agent-${agentId}.jsonl`),
      [
        {
          type: "user",
          sessionId: "fixture-session",
          agentId,
          isSidechain: true,
          uuid: "child-user",
          timestamp: "2026-07-16T08:02:01.000Z",
          cwd: "/workspace/example",
          message: { content: "Inspect the authentication flow." },
        },
        {
          type: "assistant",
          sessionId: "fixture-session",
          agentId,
          attributionAgent: "compound-engineering:ce-auth-flow-analyzer",
          isSidechain: true,
          parentUuid: "child-user",
          uuid: "child-assistant",
          timestamp: "2026-07-16T08:02:02.000Z",
          message: { content: [{ type: "text", text: "The flow is documented." }] },
        },
      ].map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8",
    );
    await appendFile(
      sessionPath,
      [
        {
          type: "assistant",
          sessionId: "fixture-session",
          uuid: "parent-agent-call",
          timestamp: "2026-07-16T08:02:00.000Z",
          message: {
            content: [{
              type: "tool_use",
              id: toolUseId,
              name: "Agent",
              input: {
                description: "Inspect authentication",
                prompt: "Inspect the authentication flow and report findings.",
                subagent_type: "Explore",
              },
            }],
          },
        },
        {
          type: "user",
          sessionId: "fixture-session",
          uuid: "parent-agent-result",
          timestamp: "2026-07-16T08:02:03.000Z",
          message: {
            content: [{
              type: "tool_result",
              tool_use_id: toolUseId,
              content: "The flow is documented.",
            }],
          },
          toolUseResult: {
            agentId,
            agentType: "Explore",
            status: "completed",
            totalDurationMs: 2_000,
          },
        },
      ].map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8",
    );

    const adapter = new ClaudeCodeAdapter({ sourceRoot });
    const scan = await adapter.scan();
    expect(scan.tracks).toHaveLength(2);
    const parent = scan.tracks.find((descriptor) => !descriptor.summary.parentTrackId);
    const child = scan.tracks.find((descriptor) => descriptor.summary.parentTrackId);
    expect(parent?.summary.capabilities.subagents).toBe(true);
    expect(child?.summary).toMatchObject({
      title: "Auth Flow Analyzer",
      parentTrackId: parent?.summary.id,
    });
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    if (!parent || !child) return;

    const parentTrack = await adapter.loadTrack(parent, { entryLimit: 100 });
    expect(TrackSchema.safeParse(parentTrack).success).toBe(true);
    const subagent = parentTrack.entries.find((entry) => entry.kind === "sub_agent");
    expect(subagent).toMatchObject({
      kind: "sub_agent",
      childTrackId: child.summary.id,
      childProviderSessionId: agentId,
      label: "Explore",
      objective: "Inspect authentication",
      status: "complete",
      durationMs: 2_000,
      parentEntryId: "parent-agent-call:0",
    });
    expect(parentTrack.relations).toContainEqual({
      type: "parent-child",
      fromEntryId: "parent-agent-call:0",
      toEntryId: subagent?.id,
    });

    const childTrack = await adapter.loadTrack(child, { entryLimit: 100 });
    expect(childTrack.summary.parentTrackId).toBe(parent.summary.id);
    expect(childTrack.entries).toHaveLength(2);
  });

  it("normalizes Claude-specific activity without exposing transport wrappers", async () => {
    const sourceRoot = await createSource();
    const sessionPath = join(sourceRoot, "example-project", "fixture-session.jsonl");
    const timestamp = "2026-07-16T08:01:00.000Z";
    await appendFile(
      sessionPath,
      [
        {
          type: "assistant",
          uuid: "skill-call",
          timestamp,
          message: { content: [{ type: "tool_use", id: "skill-1", name: "Skill", input: { skill: "review", args: "src" } }] },
        },
        {
          type: "assistant",
          uuid: "mcp-call",
          timestamp,
          message: { content: [{ type: "tool_use", id: "mcp-1", name: "mcp__github__search_code", input: { query: "activity" } }] },
        },
        {
          type: "assistant",
          uuid: "memory-call",
          timestamp,
          message: { content: [{ type: "tool_use", id: "memory-1", name: "Read", input: { file_path: "/Users/test/.claude/projects/example/memory/MEMORY.md" } }] },
        },
        {
          type: "user",
          uuid: "channel-message",
          timestamp,
          isMeta: true,
          userType: "external",
          message: { content: '<channel source="loco" id="private" topic="build">Build finished.</channel>' },
        },
        {
          type: "user",
          uuid: "command-message",
          timestamp,
          message: { content: "<command-name>/model</command-name><command-message>model</command-message><command-args>opus</command-args>" },
        },
        {
          type: "attachment",
          uuid: "skill-attachment",
          timestamp,
          attachment: { type: "invoked_skills", skills: [{ name: "review", path: "/private/skill", content: "private instructions" }] },
        },
        {
          type: "attachment",
          uuid: "hook-attachment",
          timestamp,
          attachment: { type: "hook_success", hookName: "format", hookEvent: "PostToolUse", durationMs: 42, exitCode: 0, command: "format", stdout: "done" },
        },
        {
          type: "attachment",
          uuid: "memory-attachment",
          timestamp,
          attachment: { type: "nested_memory", path: "/private/CLAUDE.md", displayPath: "CLAUDE.md", content: {} },
        },
        {
          type: "attachment",
          uuid: "mcp-attachment",
          timestamp,
          attachment: { type: "mcp_instructions_delta", addedNames: ["github"], addedBlocks: [], removedNames: [] },
        },
      ].map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8",
    );

    const adapter = new ClaudeCodeAdapter({ sourceRoot });
    const descriptor = (await adapter.scan()).tracks[0];
    expect(descriptor).toBeDefined();
    if (!descriptor) return;

    const track = await adapter.loadTrack(descriptor, { entryLimit: 100 });
    expect(TrackSchema.safeParse(track).success).toBe(true);
    expect(track.entries.filter((entry) => entry.activity).map((entry) => entry.activity?.kind)).toEqual([
      "skill",
      "mcp",
      "memory",
      "channel",
      "command",
      "skill",
      "hook",
      "memory",
      "mcp",
    ]);
    expect(track.entries.find((entry) => entry.id.startsWith("channel-message"))).toMatchObject({
      kind: "message",
      text: "Build finished.",
      activity: { kind: "channel", label: "loco", operation: "received" },
    });
    expect(track.entries.some((entry) => entry.kind === "message" && entry.text.includes("<channel"))).toBe(false);
    expect(track.entries.find((entry) => entry.id.startsWith("command-message"))).toMatchObject({
      kind: "status",
      label: "/model",
      detail: "opus",
      activity: { kind: "command", operation: "invoke" },
    });
    const invokedSkills = track.entries.find((entry) => entry.id.startsWith("skill-attachment"));
    expect(invokedSkills?.activity?.data).toEqual({ skills: ["review"] });
  });
});
