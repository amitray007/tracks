import { execFile } from "node:child_process";
import { appendFile, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { TrackLibrarySchema, TrackSchema } from "@tracks/core-model";
import { startTracksCloud, type RunningTracksCloud } from "@tracks/cloud";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliEntry = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "provider-claude-code",
  "test",
  "fixtures",
  "basic-session.jsonl",
);
const OWNER_TOKEN = "tracks-cli-owner-token-with-at-least-32-characters";
const DEVICE_TOKEN = "tracks-cli-device-token-with-at-least-32-characters";
const E2E_TEST_TIMEOUT = 15_000;
const temporaryRoots: string[] = [];
const clouds: RunningTracksCloud[] = [];
const stateDirectories: string[] = [];

async function runCli(stateDirectory: string, arguments_: string[]): Promise<string> {
  const result = await execFileAsync(process.execPath, [cliEntry, ...arguments_], {
    env: { ...process.env, TRACKS_STATE_DIR: stateDirectory },
    timeout: 20_000,
  });
  return result.stdout.trim();
}

async function signInOwner(cloud: RunningTracksCloud): Promise<string> {
  const response = await fetch(`${cloud.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: OWNER_TOKEN }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  expect(cookie).toBeTruthy();
  return cookie!;
}

async function waitFor<T>(read: () => Promise<T | null>, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the Tracks E2E state.");
}

async function createSource(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tracks-cli-source-"));
  temporaryRoots.push(root);
  const project = join(root, "example-project");
  await mkdir(project);
  await copyFile(fixturePath, join(project, "fixture-session.jsonl"));
  return root;
}

async function readEventUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
  timeoutMs = 5_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const decoder = new TextDecoder();
  let received = "";
  while (!received.includes(expected) && Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${expected}.`)),
          remaining,
        );
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    if (result.done) break;
    received += decoder.decode(result.value, { stream: true });
  }
  expect(received).toContain(expected);
  return received;
}

afterEach(async () => {
  await Promise.all(stateDirectories.splice(0).map(async (directory) => {
    try { await runCli(directory, ["logout", "--json"]); } catch { /* Already logged out. */ }
    try { await runCli(directory, ["web", "stop", "--json"]); } catch { /* Already stopped. */ }
    await rm(directory, { recursive: true, force: true });
  }));
  await Promise.all(clouds.splice(0).map((cloud) => cloud.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Tracks CLI end to end", () => {
  it("reports the installed CLI version", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "tracks-cli-state-"));
    stateDirectories.push(stateDirectory);
    expect(await runCli(stateDirectory, ["--version"])).toBe("0.1.0");
  });

  it("starts, reports, and stops the background local web service", async () => {
    const sourceRoot = await createSource();
    const stateDirectory = await mkdtemp(join(tmpdir(), "tracks-cli-state-"));
    stateDirectories.push(stateDirectory);

    const started = JSON.parse(await runCli(stateDirectory, [
      "web", "start", "--source", sourceRoot, "--no-open", "--json",
    ])) as { running: boolean; url: string; pid: number };
    expect(started.running).toBe(true);
    expect(started.pid).toBeGreaterThan(0);

    const status = JSON.parse(await runCli(stateDirectory, ["status", "--json"])) as {
      running: boolean;
      url: string;
    };
    expect(status).toMatchObject({ running: true, url: started.url });
    const library = TrackLibrarySchema.parse(await fetch(`${started.url}/api/tracks`).then((response) => response.json()));
    expect(library.tracks).toHaveLength(1);

    expect(JSON.parse(await runCli(stateDirectory, ["web", "stop", "--json"])))
      .toEqual({ stopped: true });
  }, E2E_TEST_TIMEOUT);

  it("keeps local web and the hosted connection independently operable", async () => {
    const sourceRoot = await createSource();
    const stateDirectory = await mkdtemp(join(tmpdir(), "tracks-cli-state-"));
    stateDirectories.push(stateDirectory);
    const cloud = await startTracksCloud({
      ownerToken: OWNER_TOKEN,
      deviceToken: DEVICE_TOKEN,
      webDirectory: false,
    });
    clouds.push(cloud);
    const ownerCookie = await signInOwner(cloud);

    const login = JSON.parse(await runCli(stateDirectory, [
      "login", "--server", cloud.url, "--token", DEVICE_TOKEN, "--json",
    ])) as { loggedIn: boolean; connected: boolean };
    expect(login).toEqual({ loggedIn: true, connected: false, serverUrl: cloud.url });

    const started = JSON.parse(await runCli(stateDirectory, [
      "web", "start", "--source", sourceRoot, "--no-open", "--json",
    ])) as { running: boolean; url: string };
    expect(started.running).toBe(true);
    const localOnly = JSON.parse(await runCli(stateDirectory, ["status", "--json"])) as {
      running: boolean;
      remote: { configured: boolean; connected: boolean };
    };
    expect(localOnly).toMatchObject({
      running: true,
      remote: { configured: true, connected: false },
    });
    const devicesBeforeConnect = await fetch(`${cloud.url}/api/devices`, {
      headers: { Cookie: ownerCookie },
    }).then((response) => response.json()) as { devices: unknown[] };
    expect(devicesBeforeConnect.devices).toHaveLength(0);

    await runCli(stateDirectory, ["web", "stop", "--json"]);
    const connected = JSON.parse(await runCli(stateDirectory, ["connect", "--json"])) as {
      connected: boolean;
    };
    expect(connected.connected).toBe(true);
    const remoteOnly = JSON.parse(await runCli(stateDirectory, ["status", "--json"])) as {
      agentRunning: boolean;
      running: boolean;
      url: string | null;
      remote: { connected: boolean };
    };
    expect(remoteOnly).toMatchObject({
      agentRunning: true,
      running: false,
      url: null,
      remote: { connected: true },
    });

    const devicesAfterConnect = await waitFor(async () => {
      const value = await fetch(`${cloud.url}/api/devices`, {
        headers: { Cookie: ownerCookie },
      }).then((response) => response.json()) as { devices: unknown[] };
      return value.devices.length === 1 ? value.devices : null;
    });
    expect(devicesAfterConnect).toHaveLength(1);

    await runCli(stateDirectory, ["connect", "stop", "--json"]);
    const stopped = JSON.parse(await runCli(stateDirectory, ["status", "--json"])) as {
      agentRunning: boolean;
      running: boolean;
      remote: { configured: boolean; connected: boolean };
    };
    expect(stopped).toMatchObject({
      agentRunning: false,
      running: false,
      remote: { configured: true, connected: false },
    });
  }, E2E_TEST_TIMEOUT);

  it("connects a device, relays a session, creates a live link, and reports offline", async () => {
    const sourceRoot = await createSource();
    const stateDirectory = await mkdtemp(join(tmpdir(), "tracks-cli-state-"));
    stateDirectories.push(stateDirectory);
    const cloud = await startTracksCloud({
      ownerToken: OWNER_TOKEN,
      deviceToken: DEVICE_TOKEN,
      webDirectory: false,
    });
    clouds.push(cloud);
    const ownerCookie = await signInOwner(cloud);

    const started = JSON.parse(await runCli(stateDirectory, [
      "web", "start", "--source", sourceRoot, "--no-open", "--json",
    ])) as { url: string };
    const login = JSON.parse(await runCli(stateDirectory, [
      "login", "--server", cloud.url, "--token", DEVICE_TOKEN, "--json",
    ])) as { loggedIn: boolean; connected: boolean };
    expect(login).toMatchObject({ loggedIn: true, connected: false });
    expect(JSON.parse(await runCli(stateDirectory, ["connect", "--json"])))
      .toMatchObject({ connected: true, serverUrl: cloud.url });

    const devices = await waitFor(async () => {
      const value = await fetch(`${cloud.url}/api/devices`, {
        headers: { Cookie: ownerCookie },
      }).then((response) => response.json()) as { devices: Array<{ id: string }> };
      return value.devices.length === 1 ? value.devices : null;
    });
    const deviceId = devices[0]!.id;

    const remoteLibrary = TrackLibrarySchema.parse(await fetch(
      `${cloud.url}/api/devices/${deviceId}/tracks?limit=60&offset=0`,
      { headers: { Cookie: ownerCookie } },
    ).then((response) => response.json()));
    const trackId = remoteLibrary.tracks[0]!.id;

    const shareResponse = await fetch(`${started.url}/api/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId }),
    });
    expect(shareResponse.status).toBe(201);
    const live = await shareResponse.json() as { url: string };
    const liveUrl = new URL(live.url);
    const viewerSecret = liveUrl.hash.slice(1);
    const shareId = liveUrl.pathname.split("/").at(-1)!;

    const context = await fetch(`${cloud.url}/api/shares/${shareId}/context`, {
      headers: { "X-Tracks-Share-Token": viewerSecret },
    }).then((response) => response.json()) as { online: boolean; trackId: string };
    expect(context).toMatchObject({ online: true, trackId });

    const privateLibrary = await fetch(`${cloud.url}/api/shares/${shareId}/tracks`, {
      headers: { "X-Tracks-Share-Token": viewerSecret },
    });
    expect(privateLibrary.status).toBe(404);

    const sharedTrack = TrackSchema.parse(await fetch(
      `${cloud.url}/api/shares/${shareId}/tracks/${encodeURIComponent(trackId)}?limit=120&start=0`,
      { headers: { "X-Tracks-Share-Token": viewerSecret } },
    ).then((response) => response.json()));
    expect(sharedTrack.summary.id).toBe(trackId);

    const eventResponse = await fetch(`${cloud.url}/api/shares/${shareId}/events`, {
      headers: { "X-Tracks-Share-Token": viewerSecret },
    });
    const eventReader = eventResponse.body?.getReader();
    expect(eventReader).toBeDefined();
    if (!eventReader) return;
    await readEventUntil(eventReader, "event: connected");
    await appendFile(
      join(sourceRoot, "example-project", "fixture-session.jsonl"),
      `${JSON.stringify({
        type: "assistant",
        uuid: "assistant-live-update",
        sessionId: "fixture-session",
        timestamp: "2026-07-16T08:00:05.000Z",
        message: { content: [{ type: "text", text: "This update reached the live share." }] },
      })}\n`,
      "utf8",
    );
    expect(await readEventUntil(eventReader, "event: catalog.updated"))
      .toContain(`\"trackId\":null`);
    await eventReader.cancel();

    const refreshedTrack = TrackSchema.parse(await fetch(
      `${cloud.url}/api/shares/${shareId}/tracks/${encodeURIComponent(trackId)}?direction=backward&limit=1`,
      { headers: { "X-Tracks-Share-Token": viewerSecret } },
    ).then((response) => response.json()));
    expect(refreshedTrack.entries[0]).toMatchObject({
      kind: "message",
      role: "assistant",
      text: "This update reached the live share.",
    });

    await runCli(stateDirectory, ["connect", "stop", "--json"]);
    await waitFor(async () => {
      const value = await fetch(`${started.url}/api/context`).then((response) => response.json()) as {
        remote?: { configured: boolean; connected: boolean };
      };
      return value.remote?.configured && !value.remote.connected ? value : null;
    });
    const resumedFromWeb = await fetch(`${started.url}/api/remote/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(resumedFromWeb.status).toBe(200);
    expect(await resumedFromWeb.json()).toMatchObject({ configured: true, connected: true });

    const loggedOutFromWeb = await fetch(`${started.url}/api/remote/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forget: true }),
    });
    expect(loggedOutFromWeb.status).toBe(200);
    expect(await loggedOutFromWeb.json()).toMatchObject({ configured: false, connected: false });
    await waitFor(async () => {
      const value = await fetch(`${cloud.url}/api/shares/${shareId}/context`, {
        headers: { "X-Tracks-Share-Token": viewerSecret },
      }).then((response) => response.json()) as { online: boolean };
      return value.online ? null : value;
    });
    const offlineTrack = await fetch(
      `${cloud.url}/api/shares/${shareId}/tracks/${encodeURIComponent(trackId)}?limit=1&start=0`,
      { headers: { "X-Tracks-Share-Token": viewerSecret } },
    );
    expect(offlineTrack.status).toBe(503);

    const reconnectedFromWeb = await fetch(`${started.url}/api/remote/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverUrl: cloud.url, token: DEVICE_TOKEN }),
    });
    expect(reconnectedFromWeb.status).toBe(200);
    expect(await reconnectedFromWeb.json()).toMatchObject({ configured: true, connected: true });
    await waitFor(async () => {
      const value = await fetch(`${cloud.url}/api/shares/${shareId}/context`, {
        headers: { "X-Tracks-Share-Token": viewerSecret },
      }).then((response) => response.json()) as { online: boolean };
      return value.online ? value : null;
    });

    expect(JSON.parse(await runCli(stateDirectory, ["logout", "--json"])))
      .toEqual({ loggedIn: false, connected: false });
    await waitFor(async () => {
      const value = await fetch(`${cloud.url}/api/shares/${shareId}/context`, {
        headers: { "X-Tracks-Share-Token": viewerSecret },
      }).then((response) => response.json()) as { online: boolean };
      return value.online ? null : value;
    });
  }, E2E_TEST_TIMEOUT);
});
