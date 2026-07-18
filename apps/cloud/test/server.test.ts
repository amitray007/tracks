import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { LIVE_PROTOCOL_VERSION, ServerMessageSchema } from "@tracks/live-protocol";
import { startTracksCloud, type RunningTracksCloud } from "../src/server.js";

const TOKEN = "tracks-cloud-test-token-with-32-characters";
const running: RunningTracksCloud[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((cloud) => cloud.close()));
});

async function waitFor(assertion: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 1_500;
  while (Date.now() < deadline) {
    if (await assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for cloud state.");
}

describe("Tracks cloud server", () => {
  it("requires a sufficiently strong bootstrap token", async () => {
    await expect(startTracksCloud({ token: "short" })).rejects.toThrow(/at least 32/);
  });

  it("serves health publicly and protects device presence", async () => {
    const cloud = await startTracksCloud({ token: TOKEN });
    running.push(cloud);

    const health = await fetch(`${cloud.url}/api/health`).then((response) => response.json()) as {
      ok: boolean;
      connectedDevices: number;
    };
    expect(health).toMatchObject({ ok: true, connectedDevices: 0 });

    const unauthorized = await fetch(`${cloud.url}/api/devices`);
    expect(unauthorized.status).toBe(401);

    const dashboard = await fetch(cloud.url).then((response) => response.text());
    expect(dashboard).toContain('method="post"');
    const dashboardScript = await fetch(`${cloud.url}/dashboard.js`).then((response) => response.text());
    expect(() => new Function(dashboardScript)).not.toThrow();
  });

  it("shows only currently connected device metadata", async () => {
    const cloud = await startTracksCloud({ token: TOKEN, heartbeatIntervalMs: 1_000 });
    running.push(cloud);
    const socket = new WebSocket(cloud.url.replace("http://", "ws://") + "/api/agent", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    await once(socket, "open");
    socket.send(JSON.stringify({
      type: "agent.hello",
      protocolVersion: LIVE_PROTOCOL_VERSION,
      device: {
        id: "019d2c64-2526-7f8a-b289-a1f9ad67c802",
        name: "Test Mac",
        platform: "darwin-arm64",
        version: "0.0.0-test",
        capabilities: ["library.page", "track.page"],
      },
    }));

    const [welcomeData] = await once(socket, "message");
    expect(ServerMessageSchema.parse(JSON.parse(welcomeData.toString())).type).toBe("server.welcome");

    const readDevices = async () => fetch(`${cloud.url}/api/devices`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }).then((response) => response.json()) as Promise<{ devices: Array<{ id: string; name: string }> }>;

    await waitFor(async () => (await readDevices()).devices.length === 1);
    expect((await readDevices()).devices[0]).toMatchObject({
      id: "019d2c64-2526-7f8a-b289-a1f9ad67c802",
      name: "Test Mac",
    });

    socket.close();
    await once(socket, "close");
    await waitFor(async () => (await readDevices()).devices.length === 0);
  });

  it("relays bounded requests and keeps live-share content device-backed", async () => {
    const cloud = await startTracksCloud({ token: TOKEN, webDirectory: false });
    running.push(cloud);
    const deviceId = "019d2c64-2526-7f8a-b289-a1f9ad67c805";
    const socket = new WebSocket(cloud.url.replace("http://", "ws://") + "/api/agent", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    await once(socket, "open");
    socket.send(JSON.stringify({
      type: "agent.hello",
      protocolVersion: LIVE_PROTOCOL_VERSION,
      device: {
        id: deviceId,
        name: "Relay Mac",
        platform: "darwin-arm64",
        version: "0.0.0-test",
        capabilities: ["library.page", "track.page"],
      },
    }));
    await once(socket, "message");

    const requestMessage = once(socket, "message");
    const libraryResponse = fetch(`${cloud.url}/api/devices/${deviceId}/tracks?limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const [requestData] = await requestMessage;
    const request = ServerMessageSchema.parse(JSON.parse(requestData.toString()));
    expect(request).toMatchObject({ type: "server.request", operation: "library.page" });
    if (request.type !== "server.request") return;
    socket.send(JSON.stringify({
      type: "agent.response",
      requestId: request.requestId,
      ok: true,
      payload: {
        tracks: [],
        scannedAt: "2026-07-18T00:00:00.000Z",
        sourceState: "ready",
        total: 0,
        offset: 0,
        nextOffset: null,
      },
    }));
    expect(await (await libraryResponse).json()).toMatchObject({ total: 0, tracks: [] });

    const shareMessage = once(socket, "message");
    socket.send(JSON.stringify({
      type: "agent.share.create",
      requestId: "019d2c64-2526-7f8a-b289-a1f9ad67c806",
      trackId: "claude:fixture:session",
    }));
    const [shareData] = await shareMessage;
    const created = ServerMessageSchema.parse(JSON.parse(shareData.toString()));
    expect(created.type).toBe("server.share.created");
    if (created.type !== "server.share.created") return;

    const contextUrl = `${cloud.url}/api/shares/${created.shareId}/context`;
    const readContext = () => fetch(contextUrl, {
      headers: { "X-Tracks-Share-Token": created.viewerSecret },
    }).then((response) => response.json()) as Promise<{ online: boolean }>;
    expect(await readContext()).toMatchObject({ online: true });
    socket.close();
    await once(socket, "close");
    await waitFor(async () => !(await readContext()).online);
  });
});
