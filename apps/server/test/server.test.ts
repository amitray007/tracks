import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  it("paginates the session library and supports latest-first track pages", async () => {
    const sourceRoot = await createSource();
    await writeFile(
      join(sourceRoot, "example-project", "second-session.jsonl"),
      `${JSON.stringify({
        type: "user",
        sessionId: "second-fixture",
        uuid: "second-user",
        timestamp: "2026-07-16T08:01:00.000Z",
        cwd: "/workspace/example",
        message: { content: "A second session." },
      })}\n`,
      "utf8",
    );

    const server = await startTracksServer({ sourceRoot, staticDirectory: false });
    servers.push(server);

    const firstPage = await fetch(`${server.url}/api/tracks?limit=1&offset=0`)
      .then((response) => response.json()) as Record<string, unknown>;
    const secondPage = await fetch(`${server.url}/api/tracks?limit=1&offset=1`)
      .then((response) => response.json()) as Record<string, unknown>;
    expect(firstPage).toMatchObject({ total: 2, offset: 0, nextOffset: 1 });
    expect(secondPage).toMatchObject({ total: 2, offset: 1, nextOffset: null });
    expect((firstPage.tracks as Array<{ id: string }>)[0]?.id)
      .not.toBe((secondPage.tracks as Array<{ id: string }>)[0]?.id);

    const trackId = (firstPage.tracks as Array<{ id: string }>)[0]?.id;
    expect(trackId).toBeDefined();
    if (!trackId) return;
    const latest = TrackSchema.parse(await fetch(
      `${server.url}/api/tracks/${encodeURIComponent(trackId)}?direction=backward&limit=1`,
    ).then((response) => response.json()));
    expect(latest.entries).toHaveLength(1);
    expect(latest.summary.entryCount).toBe(1);
  });

  it("keeps child transcripts out of the root library while serving their stable track links", async () => {
    const sourceRoot = await createSource();
    const projectRoot = join(sourceRoot, "example-project");
    const agentId = "server-child";
    const toolUseId = "toolu-server-child";
    await mkdir(join(projectRoot, "session", "subagents"), { recursive: true });
    await writeFile(
      join(projectRoot, "session", "subagents", `agent-${agentId}.jsonl`),
      `${JSON.stringify({
        type: "user",
        sessionId: "server-fixture",
        agentId,
        isSidechain: true,
        uuid: "server-child-user",
        timestamp: "2026-07-16T08:00:01.000Z",
        message: { content: "Inspect the server." },
      })}\n`,
      "utf8",
    );
    await appendFile(
      join(projectRoot, "session.jsonl"),
      [
        {
          type: "assistant",
          sessionId: "server-fixture",
          uuid: "server-agent-call",
          timestamp: "2026-07-16T08:00:00.500Z",
          message: { content: [{ type: "tool_use", id: toolUseId, name: "Agent", input: { description: "Inspect server" } }] },
        },
        {
          type: "user",
          sessionId: "server-fixture",
          uuid: "server-agent-result",
          timestamp: "2026-07-16T08:00:02.000Z",
          message: { content: [{ type: "tool_result", tool_use_id: toolUseId, content: "Done" }] },
          toolUseResult: { agentId, agentType: "Explore", status: "completed" },
        },
      ].map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8",
    );

    const server = await startTracksServer({ sourceRoot, staticDirectory: false });
    servers.push(server);
    const library = await fetch(`${server.url}/api/tracks`).then((response) => response.json()) as {
      total: number;
      tracks: Array<{ id: string }>;
    };
    expect(library.total).toBe(1);
    expect(library.tracks).toHaveLength(1);
    const parentTrack = TrackSchema.parse(await fetch(
      `${server.url}/api/tracks/${encodeURIComponent(library.tracks[0]!.id)}`,
    ).then((response) => response.json()));
    const subagent = parentTrack.entries.find((entry) => entry.kind === "sub_agent");
    expect(subagent?.kind).toBe("sub_agent");
    if (!subagent || subagent.kind !== "sub_agent" || !subagent.childTrackId) return;
    const childTrack = TrackSchema.parse(await fetch(
      `${server.url}/api/tracks/${encodeURIComponent(subagent.childTrackId)}`,
    ).then((response) => response.json()));
    expect(childTrack.summary.parentTrackId).toBe(parentTrack.summary.id);
    expect(childTrack.entries[0]).toMatchObject({ kind: "message", role: "user" });
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

  it("streams live catalog updates when a Claude session changes", async () => {
    const sourceRoot = await createSource();
    const server = await startTracksServer({ sourceRoot, staticDirectory: false });
    servers.push(server);

    const response = await fetch(`${server.url}/api/events`);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    if (!reader) return;

    const decoder = new TextDecoder();
    let received = "";
    const readUntil = async (needle: string) => {
      const deadline = Date.now() + 4_000;
      while (!received.includes(needle) && Date.now() < deadline) {
        const result = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE timeout")), 1_000)),
        ]);
        if (result.done) break;
        received += decoder.decode(result.value, { stream: true });
      }
      expect(received).toContain(needle);
    };

    await readUntil("event: connected");
    await appendFile(
      join(sourceRoot, "example-project", "session.jsonl"),
      `${JSON.stringify({
        type: "assistant",
        sessionId: "server-fixture",
        uuid: "assistant-1",
        timestamp: "2026-07-16T08:00:01.000Z",
        message: { content: [{ type: "text", text: "The session changed." }] },
      })}\n`,
      "utf8",
    );
    await readUntil("event: catalog.updated");
    expect(received).toContain('"changedFile":"session.jsonl"');
    await reader.cancel();
  });

  it("exposes remote state and creates live links only through the configured bridge", async () => {
    const sourceRoot = await createSource();
    const server = await startTracksServer({ sourceRoot, staticDirectory: false });
    servers.push(server);
    server.setRemoteBridge({
      snapshot: () => ({
        configured: true,
        connected: true,
        serverUrl: "https://tracks.example",
        deviceId: "019d2c64-2526-7f8a-b289-a1f9ad67c807",
        lastError: null,
      }),
      createSessionShare: async (trackId) => ({ url: `https://tracks.example/s/live#${trackId}` }),
    });

    const context = await fetch(`${server.url}/api/context`).then((response) => response.json());
    expect(context).toMatchObject({ surface: "local", remote: { connected: true } });
    const share = await fetch(`${server.url}/api/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: "claude:test:session" }),
    });
    expect(share.status).toBe(201);
    expect(await share.json()).toEqual({ url: "https://tracks.example/s/live#claude:test:session" });
  });

  it("routes local web connection and logout actions through the background agent", async () => {
    const sourceRoot = await createSource();
    const actions: string[] = [];
    const connected = {
      configured: true,
      connected: true,
      serverUrl: "https://tracks.example",
      deviceId: "019d2c64-2526-7f8a-b289-a1f9ad67c807",
      lastError: null,
    };
    const disconnected = { ...connected, connected: false };
    const loggedOut = {
      configured: false,
      connected: false,
      serverUrl: null,
      deviceId: connected.deviceId,
      lastError: null,
    };
    const server = await startTracksServer({
      sourceRoot,
      staticDirectory: false,
      remoteController: {
        connect: async (input) => {
          actions.push(input ? `connect:${input.serverUrl}` : "reconnect");
          return connected;
        },
        disconnect: async ({ forget }) => {
          actions.push(forget ? "logout" : "disconnect");
          return forget ? loggedOut : disconnected;
        },
      },
    });
    servers.push(server);

    const connect = await fetch(`${server.url}/api/remote/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverUrl: "https://tracks.example", token: "x".repeat(32) }),
    });
    expect(connect.status).toBe(200);
    expect(await connect.json()).toMatchObject({ connected: true });

    const reconnect = await fetch(`${server.url}/api/remote/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(reconnect.status).toBe(200);

    const logout = await fetch(`${server.url}/api/remote/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forget: true }),
    });
    expect(logout.status).toBe(200);
    expect(await logout.json()).toMatchObject({ configured: false, connected: false });
    expect(actions).toEqual(["connect:https://tracks.example", "reconnect", "logout"]);
  });
});
