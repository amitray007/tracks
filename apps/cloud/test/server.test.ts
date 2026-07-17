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
});
