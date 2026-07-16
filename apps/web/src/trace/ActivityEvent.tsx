import type {
  EntryActivity,
  TrackEntry,
  ToolCallEntry,
} from "@tracks/core-model";
import { Icon, type IconName } from "../ui/Icon";
import { MarkdownContent } from "../ui/MarkdownContent";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringValue(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(record: UnknownRecord, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function durationLabel(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1_000;
  return seconds < 60 ? `${seconds.toFixed(seconds < 10 ? 1 : 0)} s` : `${Math.round(seconds / 60)} min`;
}

function prettyJson(value: string): string | null {
  const source = value.trim();
  if (!source.startsWith("{") && !source.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return null;
  }
}

export function activityForEntry(
  entry: TrackEntry,
  relatedToolCall?: ToolCallEntry,
): EntryActivity | undefined {
  return entry.activity ?? (entry.kind === "tool_result" ? relatedToolCall?.activity : undefined);
}

export function activityIcon(activity: EntryActivity): IconName {
  switch (activity.kind) {
    case "skill": return "skill";
    case "mcp": return "mcp";
    case "channel": return "channel";
    case "hook": return "hook";
    case "memory": return "memory";
    case "command": return "command";
  }
}

function ActivityTag({ activity }: { activity: EntryActivity }) {
  return (
    <span className="activity-tag" data-kind={activity.kind}>
      <Icon name={activityIcon(activity)} size="xs" />
      {humanize(activity.kind)}
    </span>
  );
}

function ChannelBody({ entry, activity }: { entry: TrackEntry; activity: EntryActivity }) {
  const text = entry.kind === "message" ? entry.text : "";
  const data = asRecord(activity.data);
  const topic = stringValue(data, "topic");
  const structured = prettyJson(text);
  return (
    <div className="channel-event-card">
      <div className="activity-card-bar">
        <ActivityTag activity={activity} />
        <span>Inbound from <strong>{activity.label}</strong>{topic ? ` · ${topic}` : ""}</span>
      </div>
      <div className="entry-prose channel-event-copy">
        {structured
          ? <pre className="channel-json"><code>{structured}</code></pre>
          : <MarkdownContent value={text || "Empty channel message"} />}
      </div>
    </div>
  );
}

function SkillBody({ activity }: { activity: EntryActivity }) {
  const skills = stringArray(asRecord(activity.data), "skills");
  return (
    <div className="activity-summary-card" data-kind="skill">
      <div className="activity-card-bar">
        <ActivityTag activity={activity} />
        <span>{activity.operation === "load" ? "Instructions entered context" : humanize(activity.operation)}</span>
      </div>
      <div className="activity-token-list">
        {(skills.length > 0 ? skills : [activity.label]).map((skill) => <code key={skill}>{skill}</code>)}
      </div>
    </div>
  );
}

function McpBody({ activity }: { activity: EntryActivity }) {
  const data = asRecord(activity.data);
  const added = stringArray(data, "added");
  const removed = stringArray(data, "removed");
  return (
    <div className="activity-summary-card" data-kind="mcp">
      <div className="activity-card-bar">
        <ActivityTag activity={activity} />
        <span>MCP instructions changed</span>
      </div>
      <div className="activity-delta-list">
        {added.map((name) => <span className="is-added" key={`add-${name}`}>+ {name}</span>)}
        {removed.map((name) => <span className="is-removed" key={`remove-${name}`}>− {name}</span>)}
        {added.length + removed.length === 0 ? <span>No server names were exposed.</span> : null}
      </div>
    </div>
  );
}

function MemoryBody({ entry, activity }: { entry: TrackEntry; activity: EntryActivity }) {
  const data = asRecord(activity.data);
  const path = stringValue(data, "displayPath") ?? stringValue(data, "path")
    ?? (entry.kind === "status" ? entry.detail : null);
  return (
    <div className="memory-event-card">
      <span className="memory-event-icon"><Icon name="memory" size="sm" /></span>
      <div>
        <strong>{activity.operation === "load" ? "Project instructions loaded" : humanize(activity.operation)}</strong>
        <code title={path ?? undefined}>{path ?? activity.label}</code>
      </div>
      <ActivityTag activity={activity} />
    </div>
  );
}

function CommandBody({ entry, activity }: { entry: TrackEntry; activity: EntryActivity }) {
  const data = asRecord(activity.data);
  const command = stringValue(data, "command") ?? activity.label;
  const args = stringValue(data, "args") ?? (entry.kind === "status" ? entry.detail : null);
  return (
    <div className="command-event-card">
      <div className="activity-card-bar">
        <ActivityTag activity={activity} />
        <span>{activity.operation === "invoke" ? "Claude Code command" : "Local command result"}</span>
      </div>
      <div className="command-event-line"><code>{command}</code>{args ? <span>{args}</span> : null}</div>
      {activity.operation === "result" && entry.kind === "status" && entry.detail ? (
        <pre>{entry.detail.length > 4_000 ? `${entry.detail.slice(0, 4_000)}\n…` : entry.detail}</pre>
      ) : null}
    </div>
  );
}

function HookBody({ entry, activity }: { entry: TrackEntry; activity: EntryActivity }) {
  const data = asRecord(activity.data);
  const event = stringValue(data, "hookEvent") ?? "Stop";
  const duration = numberValue(data, "durationMs");
  const exitCode = numberValue(data, "exitCode");
  const command = stringValue(data, "command");
  const error = stringValue(data, "stderr");
  const detail = error ?? (entry.kind === "status" ? entry.detail : null);
  const failed = activity.operation.includes("error") || activity.operation === "cancelled";
  return (
    <div className="hook-event-card" data-state={failed ? "failed" : "complete"}>
      <div className="activity-card-bar">
        <ActivityTag activity={activity} />
        <span className="hook-event-name">{event}</span>
        <span className="hook-outcome">{humanize(activity.operation)}</span>
      </div>
      <dl>
        <div><dt>Hook</dt><dd>{activity.label}</dd></div>
        {duration !== null ? <div><dt>Duration</dt><dd>{durationLabel(duration)}</dd></div> : null}
        {exitCode !== null ? <div><dt>Exit</dt><dd>{exitCode}</dd></div> : null}
      </dl>
      {detail ? <div className="entry-prose hook-event-detail"><MarkdownContent value={detail} /></div> : null}
      {command ? <details><summary>Hook command <Icon name="disclosure" size="xs" /></summary><pre>{command}</pre></details> : null}
    </div>
  );
}

export function ActivityEventBody({ entry }: { entry: TrackEntry }) {
  const activity = entry.activity;
  if (!activity) return null;
  switch (activity.kind) {
    case "channel": return <ChannelBody entry={entry} activity={activity} />;
    case "skill": return <SkillBody activity={activity} />;
    case "mcp": return <McpBody activity={activity} />;
    case "memory": return <MemoryBody entry={entry} activity={activity} />;
    case "command": return <CommandBody entry={entry} activity={activity} />;
    case "hook": return <HookBody entry={entry} activity={activity} />;
  }
}
