import { z } from "zod";

export const LIVE_PROTOCOL_VERSION = 1 as const;

export const DeviceCapabilitySchema = z.enum([
  "library.page",
  "track.page",
  "track.subscribe",
  "artifact.read",
]);

export const DeviceDescriptorSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  platform: z.string().trim().min(1).max(40),
  version: z.string().trim().min(1).max(40),
  capabilities: z.array(DeviceCapabilitySchema).max(16),
}).strict();

export const AgentHelloSchema = z.object({
  type: z.literal("agent.hello"),
  protocolVersion: z.literal(LIVE_PROTOCOL_VERSION),
  device: DeviceDescriptorSchema,
}).strict();

export const AgentHeartbeatSchema = z.object({
  type: z.literal("agent.heartbeat"),
  sentAt: z.iso.datetime(),
}).strict();

export const LibraryPageParametersSchema = z.object({
  query: z.string().trim().max(240).optional(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0).max(10_000_000),
}).strict();

export const TrackPageParametersSchema = z.object({
  trackId: z.string().trim().min(1).max(512),
  limit: z.number().int().min(1).max(250),
  direction: z.enum(["forward", "backward"]),
  startSequence: z.number().int().min(0).max(100_000_000).optional(),
  beforeSequence: z.number().int().min(0).max(100_000_000).optional(),
}).strict();

export const AgentResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    type: z.literal("agent.response"),
    requestId: z.uuid(),
    ok: z.literal(true),
    payload: z.unknown(),
  }).strict(),
  z.object({
    type: z.literal("agent.response"),
    requestId: z.uuid(),
    ok: z.literal(false),
    error: z.string().trim().min(1).max(500),
  }).strict(),
]);

export const AgentInvalidateSchema = z.object({
  type: z.literal("agent.invalidate"),
  scope: z.enum(["catalog", "track"]),
  trackId: z.string().trim().min(1).max(512).optional(),
  at: z.iso.datetime(),
}).strict().refine((value) => value.scope === "catalog" || Boolean(value.trackId), {
  message: "Track invalidations require a trackId.",
});

export const AgentShareCreateSchema = z.object({
  type: z.literal("agent.share.create"),
  requestId: z.uuid(),
  trackId: z.string().trim().min(1).max(512),
}).strict();

export const AgentMessageSchema = z.union([
  AgentHelloSchema,
  AgentHeartbeatSchema,
  AgentResponseSchema,
  AgentInvalidateSchema,
  AgentShareCreateSchema,
]);

export const ServerWelcomeSchema = z.object({
  type: z.literal("server.welcome"),
  protocolVersion: z.literal(LIVE_PROTOCOL_VERSION),
  connectedAt: z.iso.datetime(),
  heartbeatIntervalMs: z.number().int().min(1_000).max(120_000),
}).strict();

export const ServerErrorSchema = z.object({
  type: z.literal("server.error"),
  code: z.enum(["invalid-message", "protocol-mismatch", "device-replaced", "capacity-exceeded"]),
  message: z.string().max(240),
}).strict();

export const ServerRequestSchema = z.discriminatedUnion("operation", [
  z.object({
    type: z.literal("server.request"),
    requestId: z.uuid(),
    operation: z.literal("library.page"),
    parameters: LibraryPageParametersSchema,
  }).strict(),
  z.object({
    type: z.literal("server.request"),
    requestId: z.uuid(),
    operation: z.literal("track.page"),
    parameters: TrackPageParametersSchema,
  }).strict(),
]);

export const ServerShareCreatedSchema = z.object({
  type: z.literal("server.share.created"),
  requestId: z.uuid(),
  shareId: z.uuid(),
  path: z.string().regex(/^\/s\/[0-9a-f-]+$/),
  viewerSecret: z.string().min(32).max(256),
}).strict();

export const ServerMessageSchema = z.union([
  ServerWelcomeSchema,
  ServerErrorSchema,
  ServerRequestSchema,
  ServerShareCreatedSchema,
]);

export const ConnectedDeviceSchema = DeviceDescriptorSchema.extend({
  connectedAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
}).strict();

export const ConnectedDevicesResponseSchema = z.object({
  devices: z.array(ConnectedDeviceSchema),
  generatedAt: z.iso.datetime(),
}).strict();

export type DeviceCapability = z.infer<typeof DeviceCapabilitySchema>;
export type DeviceDescriptor = z.infer<typeof DeviceDescriptorSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerRequest = z.infer<typeof ServerRequestSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type AgentInvalidate = z.infer<typeof AgentInvalidateSchema>;
export type ServerShareCreated = z.infer<typeof ServerShareCreatedSchema>;
export type LibraryPageParameters = z.infer<typeof LibraryPageParametersSchema>;
export type TrackPageParameters = z.infer<typeof TrackPageParametersSchema>;
export type ConnectedDevice = z.infer<typeof ConnectedDeviceSchema>;
export type ConnectedDevicesResponse = z.infer<typeof ConnectedDevicesResponseSchema>;
