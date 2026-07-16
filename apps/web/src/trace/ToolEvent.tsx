import { lazy, Suspense } from "react";
import type { SubAgentEntry, ToolCallEntry, ToolResultEntry } from "@tracks/core-model";
import { ClaudeCodeIcon } from "../ui/ClaudeCodeIcon";
import { CopyButton } from "../ui/CopyButton";
import { languageForPath } from "../ui/codeLanguage";
import { Icon, type IconName } from "../ui/Icon";
import { MarkdownContent } from "../ui/MarkdownContent";

export type ToolIntent =
  | "command"
  | "read"
  | "search"
  | "edit"
  | "create"
  | "delete"
  | "agent"
  | "question"
  | "calendar"
  | "integration"
  | "other";

type UnknownRecord = Record<string, unknown>;

const HighlightedCode = lazy(() => import("../ui/HighlightedCode").then((module) => ({
  default: module.HighlightedCode,
})));

function SyntaxCode({ code, language }: { code: string; language: string }) {
  return (
    <Suspense fallback={<span className="syntax-line">{code}</span>}>
      <HighlightedCode code={code} language={language} />
    </Suspense>
  );
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringValue(record: UnknownRecord | null, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numberValue(record: UnknownRecord | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function humanize(value: string): string {
  return value
    .replace(/^mcp__/, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function shortPath(value: string): string {
  return value.replace(/^\/Users\/[^/]+/, "~");
}

function fileName(value: string): string {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function clippedLines(value: string, limit = 80): { lines: string[]; hidden: number; total: number } {
  if (!value) return { lines: [], hidden: 0, total: 0 };
  const lines = value.split("\n");
  return {
    lines: lines.slice(0, limit),
    hidden: Math.max(0, lines.length - limit),
    total: lines.length,
  };
}

function jsonText(value: unknown): string {
  if (value === null || value === undefined) return "No arguments";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Structured data is unavailable";
  }
}

function isPureDeleteCommand(command: string): boolean {
  return /^(?:sudo\s+)?(?:git\s+)?rm\b[^;&|\n\r]*$/i.test(command.trim());
}

function deleteCommandTarget(command: string): string | null {
  const argumentsText = command
    .trim()
    .replace(/^(?:sudo\s+)?(?:git\s+)?rm\s+/i, "");
  const values = argumentsText.match(/"[^"]+"|'[^']+'|\S+/g)
    ?.filter((value) => !value.startsWith("-"))
    .map((value) => value.replace(/^['"]|['"]$/g, "")) ?? [];
  return values.length === 1 && values[0] ? fileName(values[0]) : null;
}

export function toolIntent(entry: ToolCallEntry): ToolIntent {
  const name = entry.name.toLowerCase();
  const input = asRecord(entry.input);
  const command = stringValue(input, "command") ?? "";
  if (name.includes("calendar")) return "calendar";
  if (name.includes("askuser") || name.includes("question")) return "question";
  if (name.includes("delete") || name.includes("remove") || name.includes("unlink")) return "delete";
  if (entry.category === "command" && isPureDeleteCommand(command)) return "delete";
  if (name === "edit" || name.includes("apply_patch") || name.includes("notebookedit")) return "edit";
  if (name === "write" || name.includes("create_file")) return "create";
  if (entry.category === "command") return "command";
  if (entry.category === "read") return "read";
  if (entry.category === "search") return "search";
  if (entry.category === "agent") return "agent";
  if (name.startsWith("mcp__")) return "integration";
  if (entry.category === "write") return "edit";
  return "other";
}

export function toolIcon(entry: ToolCallEntry): IconName {
  if (entry.activity?.kind === "skill") return "skill";
  if (entry.activity?.kind === "mcp") return "mcp";
  if (entry.activity?.kind === "memory") return "memory";
  switch (toolIntent(entry)) {
    case "command": return "command";
    case "read": return "read";
    case "search": return "search";
    case "edit": return "edit";
    case "create": return "create";
    case "delete": return "delete";
    case "agent": return "agent";
    case "question": return "question";
    case "calendar": return "calendar";
    case "integration": return "integration";
    case "other": return "tool";
  }
}

function calendarAction(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("create")) return "Created calendar event";
  if (normalized.includes("update")) return "Updated calendar event";
  if (normalized.includes("delete") || normalized.includes("remove")) return "Deleted calendar event";
  if (normalized.includes("list") || normalized.includes("search")) return "Checked calendar events";
  return "Used Google Calendar";
}

function integrationLabel(name: string): string {
  const [, service = "integration", operation = "request"] = name.split("__");
  const friendlyService = humanize(service.replace(/^claude_ai_/, ""));
  return `${humanize(operation)} in ${friendlyService}`;
}

export function toolHeadline(entry: ToolCallEntry): string {
  const input = asRecord(entry.input);
  const path = stringValue(input, "file_path", "path", "notebook_path");
  const description = stringValue(input, "description");
  const query = stringValue(input, "query", "pattern");
  const command = stringValue(input, "command");

  if (entry.activity?.kind === "skill") return `Invoked ${entry.activity.label}`;
  if (entry.activity?.kind === "mcp") return `${humanize(entry.activity.operation)} · ${humanize(entry.activity.label)}`;
  if (entry.activity?.kind === "memory") {
    return entry.activity.operation === "read"
      ? `Recalled ${entry.activity.label}`
      : `Updated ${entry.activity.label}`;
  }

  switch (toolIntent(entry)) {
    case "command": return `Ran ${description ?? command?.split("\n", 1)[0] ?? entry.name}`;
    case "read": return `Read ${path ? fileName(path) : entry.name}`;
    case "search": return `Searched ${query ?? description ?? entry.name}`;
    case "edit": return `Edited ${path ? fileName(path) : entry.name}`;
    case "create": return `Wrote ${path ? fileName(path) : "a file"}`;
    case "delete": {
      const target = path
        ? fileName(path)
        : command
          ? deleteCommandTarget(command)
          : null;
      const fallback = description?.replace(/^(?:remove|delete)\s+/i, "") ?? "an item";
      return `Deleted ${target ?? fallback}`;
    }
    case "agent": return `Delegated ${description ?? "a task"}`;
    case "question": return "Asked for input";
    case "calendar": return calendarAction(entry.name);
    case "integration": return integrationLabel(entry.name);
    case "other": return `Used ${humanize(entry.name)}`;
  }
}

export function toolResultHeadline(call: ToolCallEntry | undefined, isError: boolean): string {
  if (isError) return "Tool error";
  if (!call) return "Tool result";
  if (call.activity?.kind === "skill") return "Skill instructions";
  if (call.activity?.kind === "mcp") return `MCP response · ${humanize(call.activity.label)}`;
  if (call.activity?.kind === "memory") return call.activity.operation === "read" ? "Memory contents" : "Memory updated";
  switch (toolIntent(call)) {
    case "command": return "Command output";
    case "read": return "File contents";
    case "search": return "Search results";
    case "edit": return "Edit result";
    case "create": return "Write result";
    case "delete": return "Delete result";
    case "agent": return "Agent result";
    case "question": return "Response";
    case "calendar": return "Calendar result";
    case "integration": return "Integration result";
    case "other": return "Tool result";
  }
}

export function toolTone(entry: ToolCallEntry): string {
  if (entry.activity) return entry.activity.kind;
  return toolIntent(entry);
}

function RawArguments({ input }: { input: unknown }) {
  return (
    <details className="tool-input-disclosure">
      <summary>
        <span>View raw arguments</span>
        <Icon name="disclosure" size="xs" />
      </summary>
      <div className="tool-surface raw-arguments-surface"><pre>{jsonText(input)}</pre></div>
    </details>
  );
}

function TechnicalLabel({ entry }: { entry: ToolCallEntry }) {
  return (
    <span className="tool-technical-label" title={`Claude Code tool: ${entry.name}`}>
      <ClaudeCodeIcon size={10} />
      <span>{entry.name}</span>
    </span>
  );
}

function CommandCall({ entry, input }: { entry: ToolCallEntry; input: UnknownRecord | null }) {
  const command = stringValue(input, "command") ?? jsonText(entry.input);
  return (
    <div className="command-card">
      <div className="tool-card-bar">
        <span><Icon name="command" size="xs" />Shell</span>
        <CopyButton value={command} label="Copy command" />
      </div>
      <pre><SyntaxCode code={command} language="bash" /></pre>
    </div>
  );
}

function FileChangeCall({ entry, input, intent }: {
  entry: ToolCallEntry;
  input: UnknownRecord | null;
  intent: "edit" | "create" | "delete";
}) {
  const path = stringValue(input, "file_path", "path", "notebook_path") ?? "File path unavailable";
  const oldText = stringValue(input, "old_string", "old_text") ?? "";
  const newText = intent === "create"
    ? stringValue(input, "content", "new_string", "new_text") ?? ""
    : stringValue(input, "new_string", "new_text", "content") ?? "";
  const removed = clippedLines(oldText);
  const added = clippedLines(newText);
  const language = languageForPath(path);

  return (
    <div className="file-change-card" data-intent={intent}>
      <header>
        <span className="file-change-path" title={path}>
          <Icon name={intent} size="sm" />
          <span>{shortPath(path)}</span>
        </span>
        <span className="file-change-count" aria-label={`${added.total} added, ${removed.total} removed`}>
          {added.total > 0 ? <span className="addition-count">+{added.total}</span> : null}
          {removed.total > 0 || intent === "delete" ? <span className="deletion-count">−{Math.max(1, removed.total)}</span> : null}
        </span>
      </header>
      {intent === "delete" && !oldText ? (
        <div className="file-delete-note">The tool requested that this file or item be removed.</div>
      ) : (
        <div className="diff-view" data-single-pane={removed.lines.length === 0 || added.lines.length === 0} aria-label={`${intent} preview`}>
          {removed.lines.length > 0 ? (
            <div className="diff-pane diff-removed" aria-label="Removed lines">
              {removed.lines.map((line, index) => (
                <div className="diff-line" key={`removed-${index}`}>
                  <span className="diff-sign">−</span>
                  <span className="diff-number">{index + 1}</span>
                  <code><SyntaxCode code={line || " "} language={language} /></code>
                </div>
              ))}
            </div>
          ) : null}
          {added.lines.length > 0 ? (
            <div className="diff-pane diff-added" aria-label="Added lines">
              {added.lines.map((line, index) => (
                <div className="diff-line" key={`added-${index}`}>
                  <span className="diff-sign">+</span>
                  <span className="diff-number">{index + 1}</span>
                  <code><SyntaxCode code={line || " "} language={language} /></code>
                </div>
              ))}
            </div>
          ) : null}
          {removed.hidden + added.hidden > 0 ? (
            <div className="diff-clipped">{(removed.hidden + added.hidden).toLocaleString()} more lines hidden in this preview</div>
          ) : null}
        </div>
      )}
      <footer><TechnicalLabel entry={entry} /><RawArguments input={entry.input} /></footer>
    </div>
  );
}

function ReadCall({ entry, input }: { entry: ToolCallEntry; input: UnknownRecord | null }) {
  const path = stringValue(input, "file_path", "path", "notebook_path");
  const offset = numberValue(input, "offset");
  const limit = numberValue(input, "limit");
  return (
    <div className="file-operation-card" data-intent="read">
      <span className="file-operation-icon"><Icon name="read" size="sm" /></span>
      <div>
        <strong title={path ?? undefined}>{path ? shortPath(path) : "File path unavailable"}</strong>
        <span>{offset !== null || limit !== null ? `Lines ${offset ?? 1}${limit !== null ? `–${(offset ?? 1) + limit - 1}` : "+"}` : "Read file contents"}</span>
      </div>
      <TechnicalLabel entry={entry} />
      <RawArguments input={entry.input} />
    </div>
  );
}

function SearchCall({ entry, input }: { entry: ToolCallEntry; input: UnknownRecord | null }) {
  const query = stringValue(input, "query", "pattern", "description") ?? "Search query unavailable";
  const scope = stringValue(input, "path", "glob", "type") ?? "Current workspace";
  return (
    <div className="search-operation-card">
      <span className="search-operation-icon"><Icon name="search" size="sm" /></span>
      <div><strong>{query}</strong><span>{scope}</span></div>
      <TechnicalLabel entry={entry} />
      <RawArguments input={entry.input} />
    </div>
  );
}

function QuestionCall({ entry, input }: { entry: ToolCallEntry; input: UnknownRecord | null }) {
  const questions = Array.isArray(input?.questions)
    ? input.questions.filter((value): value is UnknownRecord => asRecord(value) !== null).map((value) => value as UnknownRecord)
    : [];
  return (
    <div className="question-call-card">
      {questions.slice(0, 3).map((question, index) => (
        <div className="question-call-item" key={index}>
          <span>{stringValue(question, "header") ?? `Question ${index + 1}`}</span>
          <strong>{stringValue(question, "question") ?? "Question details unavailable"}</strong>
        </div>
      ))}
      {questions.length === 0 ? <div className="question-call-item"><strong>Requested user input</strong></div> : null}
      <footer><TechnicalLabel entry={entry} /><RawArguments input={entry.input} /></footer>
    </div>
  );
}

function StructuredCall({ entry, input, intent }: {
  entry: ToolCallEntry;
  input: UnknownRecord | null;
  intent: ToolIntent;
}) {
  const prompt = stringValue(input, "prompt", "description");
  const rows = Object.entries(input ?? {})
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .filter(([key, value]) => !["prompt", "description", "content", "command"].includes(key) && String(value).length < 180)
    .slice(0, 6);

  return (
    <div className="structured-tool-card" data-intent={intent}>
      {prompt ? <div className="structured-tool-prompt"><MarkdownContent value={prompt.length > 1_200 ? `${prompt.slice(0, 1_200)}…` : prompt} /></div> : null}
      {rows.length > 0 ? (
        <dl>{rows.map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{String(value)}</dd></div>)}</dl>
      ) : null}
      <footer><TechnicalLabel entry={entry} /><RawArguments input={entry.input} /></footer>
    </div>
  );
}

function AgentCall({
  entry,
  input,
  relatedSubAgent,
  onOpenTrack,
}: {
  entry: ToolCallEntry;
  input: UnknownRecord | null;
  relatedSubAgent: SubAgentEntry | undefined;
  onOpenTrack(trackId: string): void;
}) {
  const objective = stringValue(input, "description", "prompt") ?? relatedSubAgent?.objective;
  const agentType = relatedSubAgent?.label ?? stringValue(input, "subagent_type", "agent_type") ?? "Sub-agent";
  const childTrackId = relatedSubAgent?.childTrackId;
  return (
    <div className="agent-call-card">
      <header>
        <span><Icon name="agent" size="sm" />Delegated task</span>
        <code>{humanize(agentType)}</code>
      </header>
      {objective ? <div className="agent-call-objective"><MarkdownContent value={objective} /></div> : null}
      <footer>
        <TechnicalLabel entry={entry} />
        <div className="agent-call-actions">
          <RawArguments input={entry.input} />
          {childTrackId ? (
            <button type="button" onClick={() => onOpenTrack(childTrackId)}>
              Open transcript
              <Icon name="link" size="xs" />
            </button>
          ) : <span>Transcript pending</span>}
        </div>
      </footer>
    </div>
  );
}

function ActivityToolCall({ entry, input }: { entry: ToolCallEntry; input: UnknownRecord | null }) {
  const activity = entry.activity;
  if (!activity) return null;
  const intent = toolIntent(entry);

  if (activity.kind === "memory") {
    return (
      <div className="memory-tool-call">
        <div className="memory-tool-context">
          <span><Icon name="memory" size="xs" />Claude memory</span>
          <span>{activity.operation === "read" ? "Recalled" : "Updated"}</span>
        </div>
        {intent === "read"
          ? <ReadCall entry={entry} input={input} />
          : intent === "edit" || intent === "create" || intent === "delete"
            ? <FileChangeCall entry={entry} input={input} intent={intent} />
            : <StructuredCall entry={entry} input={input} intent={intent} />}
      </div>
    );
  }

  const prompt = activity.kind === "skill"
    ? stringValue(input, "args")
    : stringValue(input, "prompt", "description");
  const rows = Object.entries(input ?? {})
    .filter(([key, value]) => key !== "args" && ["string", "number", "boolean"].includes(typeof value))
    .filter(([, value]) => String(value).length < 220)
    .slice(0, 5);

  return (
    <div className="activity-tool-card" data-kind={activity.kind}>
      <header>
        <span className="activity-tool-kind"><Icon name={activity.kind === "skill" ? "skill" : "mcp"} size="sm" />{activity.kind === "skill" ? "Skill" : "MCP"}</span>
        <strong>{activity.kind === "skill" ? activity.label : humanize(activity.label)}</strong>
        {activity.kind === "mcp" ? <code>{humanize(activity.operation)}</code> : null}
      </header>
      {prompt ? <div className="activity-tool-prompt"><MarkdownContent value={prompt} /></div> : null}
      {rows.length > 0 ? <dl>{rows.map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{String(value)}</dd></div>)}</dl> : null}
      <footer><TechnicalLabel entry={entry} /><RawArguments input={entry.input} /></footer>
    </div>
  );
}

export function ToolCallBody({
  entry,
  relatedSubAgent,
  onOpenTrack,
}: {
  entry: ToolCallEntry;
  relatedSubAgent: SubAgentEntry | undefined;
  onOpenTrack(trackId: string): void;
}) {
  const input = asRecord(entry.input);
  if (entry.activity?.kind === "skill" || entry.activity?.kind === "mcp" || entry.activity?.kind === "memory") {
    return <ActivityToolCall entry={entry} input={input} />;
  }
  const intent = toolIntent(entry);
  switch (intent) {
    case "command": return <CommandCall entry={entry} input={input} />;
    case "edit":
    case "create":
    case "delete": return entry.category === "command"
      ? <CommandCall entry={entry} input={input} />
      : <FileChangeCall entry={entry} input={input} intent={intent} />;
    case "read": return <ReadCall entry={entry} input={input} />;
    case "search": return <SearchCall entry={entry} input={input} />;
    case "question": return <QuestionCall entry={entry} input={input} />;
    case "agent": return <AgentCall
      entry={entry}
      input={input}
      relatedSubAgent={relatedSubAgent}
      onOpenTrack={onOpenTrack}
    />;
    case "calendar":
    case "integration":
    case "other": return <StructuredCall entry={entry} input={input} intent={intent} />;
  }
}

export function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textParts = content.map((item) => {
      const record = asRecord(item);
      return stringValue(record, "text", "content") ?? jsonText(item);
    });
    return textParts.join("\n");
  }
  const record = asRecord(content);
  return stringValue(record, "text", "content") ?? jsonText(content);
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function durationLabel(milliseconds: number): string {
  const totalSeconds = Math.round(milliseconds / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function AgentResult({ entry, text }: { entry: ToolResultEntry; text: string }) {
  const payload = asRecord(entry.content);
  const usage = asRecord(payload?.usage);
  const summary = stringValue(payload, "summary");
  const status = stringValue(payload, "status") ?? (entry.isError ? "failed" : "completed");
  const taskId = stringValue(payload, "taskId");
  const tokens = numberValue(usage, "subagentTokens");
  const toolUses = numberValue(usage, "toolUses");
  const durationMs = numberValue(usage, "durationMs");
  const clipped = text.length > 12_000 ? `${text.slice(0, 12_000)}\n… output clipped in this view` : text;

  return (
    <div className={`agent-result-card${entry.isError ? " is-error" : ""}`}>
      <header>
        <span className="agent-result-title" title={summary ?? "Background agent task"}>
          <Icon name="agent" size="sm" />
          <span>{summary ?? "Background agent task"}</span>
        </span>
        <span className="agent-result-status">{humanize(status)}</span>
      </header>
      <div className="entry-prose agent-result-copy">
        <MarkdownContent value={clipped || "No result content"} />
      </div>
      <footer>
        <div className="agent-result-metrics" title={taskId ? `Claude task ${taskId}` : undefined}>
          {tokens !== null ? <span title={`${tokens.toLocaleString()} sub-agent tokens`}>{compactNumber(tokens)} tokens</span> : null}
          {toolUses !== null ? <span>{toolUses.toLocaleString()} tool {toolUses === 1 ? "use" : "uses"}</span> : null}
          {durationMs !== null ? <span title={`${durationMs.toLocaleString()} ms`}>{durationLabel(durationMs)}</span> : null}
        </div>
        <CopyButton value={text} label="Copy agent result" />
      </footer>
    </div>
  );
}

export function ToolResultBody({ entry, call }: {
  entry: ToolResultEntry;
  call: ToolCallEntry | undefined;
}) {
  const text = resultText(entry.content);
  const intent = call ? toolIntent(call) : "other";
  const clipped = text.length > 12_000 ? `${text.slice(0, 12_000)}\n… output clipped in this view` : text;
  const callInput = call ? asRecord(call.input) : null;
  const sourcePath = stringValue(callInput, "file_path", "path", "notebook_path");
  const activityKind = call?.activity?.kind;

  if (intent === "agent" && stringValue(asRecord(entry.content), "taskId")) {
    return <AgentResult entry={entry} text={text} />;
  }

  if (!entry.isError && call && ["edit", "create", "delete"].includes(intent)) {
    return (
      <div className="change-result-card" data-intent={intent}>
        <Icon name="status" size="sm" />
        <span>{text.split("\n", 1)[0] || `${humanize(intent)} completed`}</span>
      </div>
    );
  }

  return (
    <div className={`tool-surface result-surface result-${activityKind ?? intent}${entry.isError ? " is-error" : ""}`}>
      <div className="tool-card-bar">
        <span>{entry.isError
          ? "Error output"
          : activityKind === "skill"
            ? "Loaded skill instructions"
            : activityKind === "mcp"
              ? `Response from ${call?.activity?.label ?? "MCP"}`
              : activityKind === "memory"
                ? "Claude memory"
                : call ? `From ${call.name}` : "Result data"}</span>
        <CopyButton value={text} label="Copy output" />
      </div>
      <pre>{intent === "read" && sourcePath
        ? <SyntaxCode code={clipped || "No result content"} language={languageForPath(sourcePath)} />
        : clipped || "No result content"}</pre>
    </div>
  );
}
