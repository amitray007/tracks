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

export const AgentMessageSchema = z.discriminatedUnion("type", [
  AgentHelloSchema,
  AgentHeartbeatSchema,
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

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ServerWelcomeSchema,
  ServerErrorSchema,
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
export type ConnectedDevice = z.infer<typeof ConnectedDeviceSchema>;
export type ConnectedDevicesResponse = z.infer<typeof ConnectedDevicesResponseSchema>;
