import { describe, expect, it } from "vitest";
import {
  AgentMessageSchema,
  ConnectedDevicesResponseSchema,
  LIVE_PROTOCOL_VERSION,
  ServerMessageSchema,
} from "../src/index.js";

describe("live protocol", () => {
  it("accepts a bounded device hello", () => {
    const result = AgentMessageSchema.parse({
      type: "agent.hello",
      protocolVersion: LIVE_PROTOCOL_VERSION,
      device: {
        id: "019d2c64-2526-7f8a-b289-a1f9ad67c802",
        name: "Amit's MacBook",
        platform: "darwin-arm64",
        version: "0.0.0",
        capabilities: ["library.page", "track.page", "track.subscribe"],
      },
    });

    expect(result.type).toBe("agent.hello");
  });

  it("rejects unknown agent operations", () => {
    expect(() => AgentMessageSchema.parse({ type: "filesystem.read", path: "/etc/passwd" }))
      .toThrow();
  });

  it("keeps the cloud device projection free of session payloads", () => {
    const result = ConnectedDevicesResponseSchema.safeParse({
      devices: [{
        id: "019d2c64-2526-7f8a-b289-a1f9ad67c802",
        name: "Amit's MacBook",
        platform: "darwin-arm64",
        version: "0.0.0",
        capabilities: ["track.page"],
        connectedAt: "2026-07-18T00:00:00.000Z",
        lastSeenAt: "2026-07-18T00:00:01.000Z",
        sessions: [{ title: "must not cross this boundary" }],
      }],
      generatedAt: "2026-07-18T00:00:02.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("validates bounded library and track requests", () => {
    expect(ServerMessageSchema.parse({
      type: "server.request",
      requestId: "019d2c64-2526-7f8a-b289-a1f9ad67c803",
      operation: "library.page",
      parameters: { limit: 60, offset: 0 },
    }).type).toBe("server.request");

    expect(() => ServerMessageSchema.parse({
      type: "server.request",
      requestId: "019d2c64-2526-7f8a-b289-a1f9ad67c804",
      operation: "track.page",
      parameters: { trackId: "track", limit: 10_000, direction: "forward" },
    })).toThrow();
  });
});
