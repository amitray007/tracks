import { createHash } from "node:crypto";

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function stableId(...parts: Array<string | number>): string {
  const digest = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  return digest.slice(0, 24);
}

export function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function compactText(value: string, maximum = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maximum) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

export function readRecordType(record: UnknownRecord): string | null {
  return asString(record.type);
}

export function readMessage(record: UnknownRecord): UnknownRecord | null {
  return isRecord(record.message) ? record.message : null;
}
