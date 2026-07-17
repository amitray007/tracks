import { z } from "zod";

export const AvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "redacted",
  "partial",
  "stale",
]);

export type Availability = z.infer<typeof AvailabilitySchema>;

export const TrackCapabilitiesSchema = z.object({
  reasoning: z.boolean(),
  toolResults: z.boolean(),
  usage: z.boolean(),
  fileChanges: z.boolean(),
  subagents: z.boolean(),
  rawEvidence: z.boolean(),
});

export type TrackCapabilities = z.infer<typeof TrackCapabilitiesSchema>;

export const TrackSummarySchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  providerLabel: z.string().min(1),
  projectId: z.string().min(1),
  projectLabel: z.string().min(1),
  title: z.string().min(1),
  startedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  entryCount: z.number().int().nonnegative().nullable(),
  sourceBytes: z.number().int().nonnegative(),
  state: z.enum(["live", "recent", "complete", "unknown", "partial"]),
  capabilities: TrackCapabilitiesSchema,
  parentTrackId: z.string().min(1).nullable().optional(),
});

export type TrackSummary = z.infer<typeof TrackSummarySchema>;

export const ActivityKindSchema = z.enum([
  "skill",
  "mcp",
  "channel",
  "hook",
  "memory",
  "command",
]);

export type ActivityKind = z.infer<typeof ActivityKindSchema>;

export const EntryActivitySchema = z.object({
  kind: ActivityKindSchema,
  label: z.string().min(1),
  operation: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type EntryActivity = z.infer<typeof EntryActivitySchema>;

const EntryBaseSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  parentEntryId: z.string().min(1).nullable().optional(),
  providerRecordKind: z.string().nullable(),
  activity: EntryActivitySchema.optional(),
});

export const MessageEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("message"),
  role: z.enum(["user", "assistant", "system"]),
  text: z.string(),
});

export const ReasoningEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("reasoning"),
  text: z.string().nullable(),
  availability: AvailabilitySchema,
});

export const ToolCallEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("tool_call"),
  toolUseId: z.string().nullable(),
  name: z.string().min(1),
  category: z.enum(["command", "read", "search", "write", "agent", "other"]),
  input: z.unknown(),
});

export const ToolResultEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("tool_result"),
  toolUseId: z.string().nullable(),
  content: z.unknown(),
  isError: z.boolean(),
});

export const StatusEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("status"),
  label: z.string().min(1),
  detail: z.string().nullable(),
  tone: z.enum(["neutral", "success", "warning", "danger"]),
});

export const SubAgentEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("sub_agent"),
  childTrackId: z.string().min(1).nullable(),
  childProviderSessionId: z.string().min(1).nullable(),
  label: z.string().min(1).nullable(),
  objective: z.string().min(1).nullable(),
  status: z.enum([
    "waiting",
    "running",
    "complete",
    "failed",
    "cancelled",
    "partial",
    "unknown",
  ]),
});

export const UnsupportedEntrySchema = EntryBaseSchema.extend({
  kind: z.literal("unsupported"),
  summary: z.string().min(1),
  rawAvailable: z.boolean(),
});

export const TrackEntrySchema = z.discriminatedUnion("kind", [
  MessageEntrySchema,
  ReasoningEntrySchema,
  ToolCallEntrySchema,
  ToolResultEntrySchema,
  SubAgentEntrySchema,
  StatusEntrySchema,
  UnsupportedEntrySchema,
]);

export type MessageEntry = z.infer<typeof MessageEntrySchema>;
export type ReasoningEntry = z.infer<typeof ReasoningEntrySchema>;
export type ToolCallEntry = z.infer<typeof ToolCallEntrySchema>;
export type ToolResultEntry = z.infer<typeof ToolResultEntrySchema>;
export type SubAgentEntry = z.infer<typeof SubAgentEntrySchema>;
export type StatusEntry = z.infer<typeof StatusEntrySchema>;
export type UnsupportedEntry = z.infer<typeof UnsupportedEntrySchema>;
export type TrackEntry = z.infer<typeof TrackEntrySchema>;

export const TrackDiagnosticSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().min(1),
  message: z.string().min(1),
  approximateLine: z.number().int().positive().nullable(),
});

export type TrackDiagnostic = z.infer<typeof TrackDiagnosticSchema>;

export const EntryRelationSchema = z.object({
  type: z.enum([
    "responds-to",
    "tool-call-result",
    "caused",
    "parent-child",
    "supersedes",
    "same-artifact",
  ]),
  fromEntryId: z.string().min(1),
  toEntryId: z.string().min(1),
});

export type EntryRelation = z.infer<typeof EntryRelationSchema>;

export const TrackSchema = z.object({
  summary: TrackSummarySchema,
  entries: z.array(TrackEntrySchema),
  relations: z.array(EntryRelationSchema).default([]),
  diagnostics: z.array(TrackDiagnosticSchema),
  truncated: z.boolean(),
  nextSequence: z.number().int().nonnegative().nullable(),
});

export type Track = z.infer<typeof TrackSchema>;

export const TrackLibrarySchema = z.object({
  tracks: z.array(TrackSummarySchema),
  scannedAt: z.string().datetime(),
  sourceState: z.enum(["ready", "missing", "unreadable"]),
  sourceMessage: z.string().nullable(),
});

export type TrackLibrary = z.infer<typeof TrackLibrarySchema>;
