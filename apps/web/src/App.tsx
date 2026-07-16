import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ActivityKind,
  Track,
  TrackEntry,
  TrackSummary,
  ToolCallEntry,
} from "@tracks/core-model";
import {
  getTrackPage,
  getTrackLibrary,
  getViewerIdentity,
  type TrackLibraryResponse,
  type ViewerIdentity,
} from "./api";
import {
  ToolCallBody,
  ToolResultBody,
  toolHeadline,
  toolIcon,
  toolResultHeadline,
  toolIntent,
  toolTone,
  type ToolIntent,
} from "./trace/ToolEvent";
import {
  ActivityEventBody,
  activityForEntry,
  activityIcon,
} from "./trace/ActivityEvent";
import { CopyButton } from "./ui/CopyButton";
import { ClaudeCodeIcon } from "./ui/ClaudeCodeIcon";
import { Icon, type IconName } from "./ui/Icon";
import { MarkdownContent } from "./ui/MarkdownContent";

type ViewMode = "compact" | "full";
type LiveState = "connecting" | "live" | "reconnecting";
type EntryFilter = "messages" | "reasoning" | "tools" | "results" | "status" | "provider";
type SidebarGroupMode = "time" | "project";
type TraceOrder = "oldest" | "latest";
type TraceSearchMode = "text" | "regex";

const LIBRARY_PAGE_SIZE = 60;
const TRACE_PAGE_SIZE = 120;

const ENTRY_FILTERS: ReadonlyArray<{
  id: EntryFilter;
  label: string;
  icon: IconName;
}> = [
  { id: "messages", label: "Messages", icon: "message" },
  { id: "reasoning", label: "Reasoning", icon: "reasoning" },
  { id: "tools", label: "Tool calls", icon: "tool" },
  { id: "results", label: "Tool results", icon: "result" },
  { id: "status", label: "Status", icon: "status" },
  { id: "provider", label: "Provider events", icon: "info" },
];

const ALL_ENTRY_FILTERS = ENTRY_FILTERS.map(({ id }) => id);
const DEFAULT_ENTRY_FILTERS: ReadonlyArray<EntryFilter> = [
  "messages",
  "reasoning",
  "tools",
  "results",
];

const TOOL_FILTERS: ReadonlyArray<{
  id: ToolIntent;
  label: string;
  icon: IconName;
}> = [
  { id: "read", label: "Read", icon: "read" },
  { id: "edit", label: "Edit", icon: "edit" },
  { id: "create", label: "Write", icon: "create" },
  { id: "delete", label: "Delete", icon: "delete" },
  { id: "command", label: "Run command", icon: "command" },
  { id: "search", label: "Search", icon: "search" },
  { id: "agent", label: "Agent", icon: "agent" },
  { id: "question", label: "Questions", icon: "question" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "integration", label: "Integrations", icon: "integration" },
  { id: "other", label: "Other tools", icon: "tool" },
];

const ALL_TOOL_FILTERS = TOOL_FILTERS.map(({ id }) => id);

const ACTIVITY_FILTERS: ReadonlyArray<{
  id: ActivityKind;
  label: string;
  icon: IconName;
}> = [
  { id: "skill", label: "Skills", icon: "skill" },
  { id: "mcp", label: "MCP", icon: "mcp" },
  { id: "channel", label: "Channels", icon: "channel" },
  { id: "hook", label: "Hooks", icon: "hook" },
  { id: "memory", label: "Memory", icon: "memory" },
  { id: "command", label: "Commands", icon: "command" },
];

const ALL_ACTIVITY_FILTERS = ACTIVITY_FILTERS.map(({ id }) => id);

function filterForEntry(entry: TrackEntry): EntryFilter {
  switch (entry.kind) {
    case "message": return "messages";
    case "reasoning": return "reasoning";
    case "tool_call": return "tools";
    case "tool_result": return "results";
    case "status": return "status";
    case "unsupported": return "provider";
  }
}

function searchableValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function entrySearchText(entry: TrackEntry): string {
  const providerKind = entry.providerRecordKind ?? "";
  const activity = entry.activity
    ? `${entry.activity.kind}\n${entry.activity.label}\n${entry.activity.operation}\n${searchableValue(entry.activity.data)}`
    : "";
  switch (entry.kind) {
    case "message": return `${entry.role}\n${entry.text}\n${activity}\n${providerKind}`;
    case "reasoning": return `${entry.text ?? ""}\n${activity}\n${providerKind}`;
    case "tool_call": return `${entry.name}\n${searchableValue(entry.input)}\n${activity}\n${providerKind}`;
    case "tool_result": return `${searchableValue(entry.content)}\n${activity}\n${providerKind}`;
    case "status": return `${entry.label}\n${entry.detail ?? ""}\n${entry.tone}\n${activity}\n${providerKind}`;
    case "unsupported": return `${entry.summary}\n${activity}\n${providerKind}`;
  }
}

function mergeTrackPage(current: Track, page: Track): Track {
  const entryIds = new Set<string>();
  const entries = [...current.entries, ...page.entries]
    .sort((left, right) => left.sequence - right.sequence)
    .filter((entry) => {
      if (entryIds.has(entry.id)) return false;
      entryIds.add(entry.id);
      return true;
    });
  const diagnosticKeys = new Set<string>();
  const diagnostics = [...current.diagnostics, ...page.diagnostics].filter((diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.approximateLine ?? ""}:${diagnostic.message}`;
    if (diagnosticKeys.has(key)) return false;
    diagnosticKeys.add(key);
    return true;
  });
  return {
    ...page,
    summary: {
      ...page.summary,
      entryCount: page.summary.entryCount ?? current.summary.entryCount,
    },
    entries,
    diagnostics,
  };
}

function readModeFromLocation(): ViewMode {
  return new URLSearchParams(window.location.search).get("view") === "full" ? "full" : "compact";
}

function readSidebarGroupFromLocation(): SidebarGroupMode {
  return new URLSearchParams(window.location.search).get("group") === "project" ? "project" : "time";
}

function readTraceOrderFromLocation(): TraceOrder {
  return new URLSearchParams(window.location.search).get("order") === "latest" ? "latest" : "oldest";
}

function readFiltersFromLocation(): Set<EntryFilter> {
  const values = new URLSearchParams(window.location.search).getAll("type");
  if (values.includes("none")) return new Set();
  const known = values.filter((value): value is EntryFilter =>
    ALL_ENTRY_FILTERS.includes(value as EntryFilter),
  );
  return new Set(known.length > 0 ? known : DEFAULT_ENTRY_FILTERS);
}

function readToolFiltersFromLocation(): Set<ToolIntent> {
  const values = new URLSearchParams(window.location.search).getAll("tool");
  if (values.includes("none")) return new Set();
  const known = values.filter((value): value is ToolIntent =>
    ALL_TOOL_FILTERS.includes(value as ToolIntent),
  );
  return new Set(known.length > 0 ? known : ALL_TOOL_FILTERS);
}

function readActivityFiltersFromLocation(): Set<ActivityKind> {
  const values = new URLSearchParams(window.location.search).getAll("activity");
  if (values.includes("none")) return new Set();
  const known = values.filter((value): value is ActivityKind =>
    ALL_ACTIVITY_FILTERS.includes(value as ActivityKind),
  );
  return new Set(known.length > 0 ? known : ALL_ACTIVITY_FILTERS);
}

function formatRelativeTime(value: string): string {
  const distance = Date.now() - Date.parse(value);
  const minutes = Math.floor(distance / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

const SESSION_GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;
type SessionGroupLabel = typeof SESSION_GROUPS[number];

function sessionGroup(value: string): SessionGroupLabel {
  const now = new Date();
  const date = new Date(value);
  const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dateKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((todayKey - dateKey) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  return "Older";
}

function formatDate(value: string | null): string {
  if (!value) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(value >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
}

function entryPresentation(
  entry: TrackEntry,
  relatedToolCall?: ToolCallEntry,
): { icon: IconName; label: string; tone: string } {
  const activity = activityForEntry(entry, relatedToolCall);
  if (activity && entry.kind !== "tool_call" && entry.kind !== "tool_result") {
    return {
      icon: activityIcon(activity),
      label: activity.kind === "channel"
        ? `Channel · ${activity.label}`
        : entry.kind === "status" ? entry.label : activity.label,
      tone: activity.kind,
    };
  }
  switch (entry.kind) {
    case "message":
      return entry.role === "user"
        ? { icon: "user", label: "You", tone: "user" }
        : entry.role === "assistant"
          ? { icon: "assistant", label: "Claude", tone: "assistant" }
          : { icon: "info", label: "System", tone: "neutral" };
    case "reasoning":
      return { icon: "reasoning", label: "Reasoning", tone: "reasoning" };
    case "tool_call":
      return {
        icon: toolIcon(entry),
        label: toolHeadline(entry),
        tone: toolTone(entry),
      };
    case "tool_result":
      return entry.isError
        ? { icon: "error", label: "Tool error", tone: "danger" }
        : {
            icon: relatedToolCall ? toolIcon(relatedToolCall) : "result",
            label: toolResultHeadline(relatedToolCall, false),
            tone: relatedToolCall ? toolTone(relatedToolCall) : "result",
          };
    case "status":
      return { icon: entry.tone === "danger" ? "error" : "status", label: entry.label, tone: entry.tone };
    case "unsupported":
      return { icon: "info", label: "Provider event", tone: "neutral" };
  }
}

function EntryBody({ entry, relatedToolCall }: {
  entry: TrackEntry;
  relatedToolCall: ToolCallEntry | undefined;
}) {
  if (entry.activity && entry.kind !== "tool_call" && entry.kind !== "tool_result") {
    return <ActivityEventBody entry={entry} />;
  }
  switch (entry.kind) {
    case "message":
      return <div className="entry-prose"><MarkdownContent value={entry.text} /></div>;
    case "reasoning":
      return (
        <details className="reasoning-disclosure">
          <summary>
            <span>{entry.availability === "available" ? "Show reasoning" : "Reasoning unavailable"}</span>
            <Icon name="disclosure" size="sm" />
          </summary>
          {entry.text ? <div className="entry-prose reasoning-copy"><MarkdownContent value={entry.text} /></div> : null}
        </details>
      );
    case "tool_call":
      return <ToolCallBody entry={entry} />;
    case "tool_result":
      return <ToolResultBody entry={entry} call={relatedToolCall} />;
    case "status":
      return entry.detail ? <div className="entry-prose subtle-copy"><MarkdownContent value={entry.detail} /></div> : null;
    case "unsupported":
      return (
        <div className="unsupported-copy">
          <span>{entry.summary}</span>
          {entry.providerRecordKind ? <code>{entry.providerRecordKind}</code> : null}
        </div>
      );
  }
}

function EntryNode({
  entry,
  icon,
  viewer,
}: {
  entry: TrackEntry;
  icon: IconName;
  viewer: ViewerIdentity | null;
}) {
  if (entry.activity) {
    return <span className="entry-node activity-entry-node" data-kind={entry.activity.kind}><Icon name={activityIcon(entry.activity)} size="sm" /></span>;
  }
  if (entry.kind === "message" && entry.role === "user") {
    return (
      <span className="entry-avatar-shell">
        <Icon name="user" size="sm" />
        {viewer?.avatarUrl ? (
          <img
            className="entry-avatar github-avatar"
            src={viewer.avatarUrl}
            alt=""
            onError={(event) => event.currentTarget.remove()}
          />
        ) : null}
      </span>
    );
  }
  if (entry.kind === "message" && entry.role === "assistant") {
    return <span className="entry-brand-avatar"><ClaudeCodeIcon size={20} /></span>;
  }
  return <span className="entry-node"><Icon name={icon} size="sm" /></span>;
}

function EntryFrame({ entry, relatedToolCall, viewer, totalEntries }: {
  entry: TrackEntry;
  relatedToolCall: ToolCallEntry | undefined;
  viewer: ViewerIdentity | null;
  totalEntries: number | null;
}) {
  const presentation = entryPresentation(entry, relatedToolCall);
  return (
    <article
      className={`entry entry-${entry.kind} tone-${presentation.tone}`}
      id={`entry-${entry.id}`}
      aria-posinset={entry.sequence + 1}
      aria-setsize={totalEntries ?? undefined}
    >
      <div className="entry-rail" aria-hidden="true">
        <EntryNode entry={entry} icon={presentation.icon} viewer={viewer} />
      </div>
      <div className="entry-content">
        <header className="entry-header">
          <span className="entry-label">{presentation.label}</span>
          <span className="entry-actions">
            {entry.timestamp ? (
              <time dateTime={entry.timestamp} title={formatDate(entry.timestamp)}>
                {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
                  new Date(entry.timestamp),
                )}
              </time>
            ) : null}
            {entry.kind === "message" ? <CopyButton value={entry.text} label="Copy message" className="entry-copy" /> : null}
          </span>
        </header>
        <EntryBody entry={entry} relatedToolCall={relatedToolCall} />
      </div>
    </article>
  );
}

function SessionRow({
  track,
  selected,
  onSelect,
}: {
  track: TrackSummary;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <button
      className="session-row"
      data-selected={selected}
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
      type="button"
    >
      <span className="session-row-main">
        <span className="session-title">{track.title}</span>
        <time dateTime={track.updatedAt} title={formatDate(track.updatedAt)}>
          {formatRelativeTime(track.updatedAt)}
        </time>
      </span>
      <span className="session-meta">
        <span className="session-provider" title={track.providerLabel}>
          <ClaudeCodeIcon size={12} />
          <span className="sr-only">{track.providerLabel}</span>
        </span>
        <span className="session-project"><Icon name="project" size="xs" />{track.projectLabel}</span>
      </span>
    </button>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: IconName;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange(mode: ViewMode): void }) {
  return (
    <div className="view-toggle" role="tablist" aria-label="Session view">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "compact"}
        data-active={mode === "compact"}
        onClick={() => onChange("compact")}
      >
        <Icon name="compact" size="sm" />
        Highlights
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "full"}
        data-active={mode === "full"}
        onClick={() => onChange("full")}
      >
        <Icon name="full" size="sm" />
        Full trace
      </button>
    </div>
  );
}

function TraceSearch({
  query,
  searchMode,
  matchCount,
  totalCount,
  error,
  onQueryChange,
  onSearchModeChange,
  onClear,
}: {
  query: string;
  searchMode: TraceSearchMode;
  matchCount: number;
  totalCount: number;
  error: string | null;
  onQueryChange(value: string): void;
  onSearchModeChange(mode: TraceSearchMode): void;
  onClear(): void;
}) {
  const active = query.length > 0;
  return (
    <div
      className="trace-search"
      role="search"
      aria-label="Filter current session"
      data-invalid={Boolean(error)}
      title={error ?? undefined}
    >
      <Icon name="search" size="sm" />
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && active) {
            event.stopPropagation();
            onClear();
          }
        }}
        placeholder="Filter session"
        aria-label="Filter session entries"
        aria-invalid={Boolean(error)}
        aria-describedby={active ? "trace-search-status" : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {active ? (
        <output id="trace-search-status" aria-live="polite" title="Matches in loaded entries">
          {error ? "Invalid" : `${matchCount}/${totalCount}`}
        </output>
      ) : null}
      {active ? (
        <button
          className="trace-search-clear"
          type="button"
          aria-label="Clear trace search"
          title="Clear search"
          onClick={onClear}
        >
          <Icon name="close" size="xs" />
        </button>
      ) : null}
      <button
        className="trace-search-mode"
        type="button"
        aria-label="Use regular expression"
        title={searchMode === "regex" ? "Use plain text" : "Use regular expression"}
        aria-pressed={searchMode === "regex"}
        data-active={searchMode === "regex"}
        onClick={() => onSearchModeChange(searchMode === "regex" ? "text" : "regex")}
      >
        .*
      </button>
    </div>
  );
}

function InfiniteLoadSentinel({
  loading,
  label,
  error,
  autoLoad = true,
  onLoad,
}: {
  loading: boolean;
  label: string;
  error?: string | null;
  autoLoad?: boolean;
  onLoad(): void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading || !autoLoad) return;
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) onLoad();
    }, { rootMargin: "240px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [autoLoad, loading, onLoad]);

  return (
    <div className="infinite-sentinel" ref={sentinelRef} aria-live="polite">
      <button className="load-more" type="button" onClick={onLoad} disabled={loading} title={error ?? undefined}>
        {loading ? <span className="loading-spinner" aria-hidden="true" /> : <Icon name={error ? "refresh" : "disclosure"} size="xs" />}
        {loading ? "Loading…" : error ? `Retry ${label.toLowerCase()}` : label}
      </button>
      {error ? <span>{error}</span> : null}
    </div>
  );
}

function TraceJumpNavigation() {
  const [scrollState, setScrollState] = useState({
    scrollable: false,
    atTop: true,
    atBottom: true,
  });

  useEffect(() => {
    let animationFrame = 0;
    const update = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>(".workspace");
        if (!root) return;
        const next = {
          scrollable: root.scrollHeight > root.clientHeight + 16,
          atTop: root.scrollTop <= 8,
          atBottom: root.scrollTop + root.clientHeight >= root.scrollHeight - 8,
        };
        setScrollState((current) =>
          current.scrollable === next.scrollable
          && current.atTop === next.atTop
          && current.atBottom === next.atBottom
            ? current
            : next,
        );
      });
    };

    const resizeObserver = new ResizeObserver(update);
    const root = document.querySelector<HTMLElement>(".workspace");
    const content = document.querySelector<HTMLElement>(".workspace-body");
    if (root) {
      resizeObserver.observe(root);
      root.addEventListener("scroll", update, { passive: true });
    }
    if (content) resizeObserver.observe(content);
    window.addEventListener("resize", update);
    update();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      root?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!scrollState.scrollable) return null;

  return (
    <nav className="trace-jump-navigation" aria-label="Trace navigation">
      <button
        type="button"
        aria-label="Jump to top of trace"
        title="Jump to top"
        aria-controls="session-trace"
        disabled={scrollState.atTop}
        onClick={() => document.querySelector<HTMLElement>(".workspace")?.scrollTo({ top: 0 })}
      >
        <Icon name="up" size="sm" />
      </button>
      <button
        type="button"
        aria-label="Jump to bottom of trace"
        title="Jump to bottom"
        aria-controls="session-trace"
        disabled={scrollState.atBottom}
        onClick={() => {
          const root = document.querySelector<HTMLElement>(".workspace");
          root?.scrollTo({ top: root.scrollHeight });
        }}
      >
        <Icon name="down" size="sm" />
      </button>
    </nav>
  );
}

function EmptyPanel({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="empty-panel">
      <span className="empty-icon"><Icon name={icon} size="lg" /></span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function SessionOverview({ track, mode }: { track: Track; mode: ViewMode }) {
  const userMessages = track.entries.filter(
    (entry) => entry.kind === "message" && entry.role === "user",
  ).length;
  const assistantMessages = track.entries.filter(
    (entry) => entry.kind === "message" && entry.role === "assistant",
  ).length;
  const toolCalls = track.entries.filter((entry) => entry.kind === "tool_call");
  const uniqueTools = new Set(toolCalls.map((entry) => entry.name)).size;
  const errors = track.entries.filter((entry) =>
    (entry.kind === "tool_result" && entry.isError)
    || (entry.kind === "status" && entry.tone === "danger"),
  ).length;
  const providerEvents = track.entries.filter((entry) => entry.kind === "unsupported").length;
  const mechanics = track.entries.length - userMessages - assistantMessages - errors;

  return (
    <section className="session-overview" aria-label="Loaded session overview">
      <header>
        <span>Summary</span>
        <span className="overview-badge">
          <span />
          {track.summary.state === "unknown" ? "Saved session" : track.summary.state}
        </span>
      </header>
      <div className="overview-rows">
        <div>
          <Icon name="message" size="sm" />
          <span>Conversation</span>
          <strong>{userMessages} prompts and {assistantMessages} responses in loaded entries.</strong>
        </div>
        <div>
          <Icon name="tool" size="sm" />
          <span>Work</span>
          <strong>{toolCalls.length} tool calls across {uniqueTools} distinct tools.</strong>
        </div>
        <div>
          <Icon name={errors > 0 ? "warning" : "status"} size="sm" />
          <span>Quality</span>
          <strong>{errors} errors detected; {providerEvents} provider-specific events preserved.</strong>
        </div>
      </div>
      <footer>
        {mode === "compact"
          ? `${Math.max(0, mechanics).toLocaleString()} loaded implementation events hidden from Highlights`
          : `${track.entries.length.toLocaleString()} entries loaded${track.truncated ? " · more available on scroll" : ""}`}
      </footer>
    </section>
  );
}

function DetailsRail({
  track,
  mode,
  liveState,
  traceOrder,
  activeFilters,
  activeToolFilters,
  activeActivityFilters,
  filterCounts,
  toolFilterCounts,
  activityFilterCounts,
  onToggleFilter,
  onToggleToolFilter,
  onToggleActivityFilter,
  onResetFilters,
  onClearFilters,
  onTraceOrderChange,
}: {
  track: Track;
  mode: ViewMode;
  liveState: LiveState;
  traceOrder: TraceOrder;
  activeFilters: ReadonlySet<EntryFilter>;
  activeToolFilters: ReadonlySet<ToolIntent>;
  activeActivityFilters: ReadonlySet<ActivityKind>;
  filterCounts: Record<EntryFilter, number>;
  toolFilterCounts: Record<ToolIntent, number>;
  activityFilterCounts: Record<ActivityKind, number>;
  onToggleFilter(filter: EntryFilter): void;
  onToggleToolFilter(filter: ToolIntent): void;
  onToggleActivityFilter(filter: ActivityKind): void;
  onResetFilters(): void;
  onClearFilters(): void;
  onTraceOrderChange(order: TraceOrder): void;
}) {
  const capabilities = Object.entries(track.summary.capabilities).filter(([, available]) => available);
  return (
    <aside className="details-rail" aria-label="Session details">
      <section>
        <div className="rail-heading">Session</div>
        <dl>
          <div>
            <dt>Provider</dt>
            <dd className="provider-value">
              <ClaudeCodeIcon size={14} />
              <span>{track.summary.providerLabel}</span>
            </dd>
          </div>
          <div><dt>Project</dt><dd>{track.summary.projectLabel}</dd></div>
          <div><dt>Started</dt><dd>{formatDate(track.summary.startedAt)}</dd></div>
          <div><dt>Source</dt><dd>{formatBytes(track.summary.sourceBytes)}</dd></div>
        </dl>
      </section>
      {mode === "full" ? (
        <>
        <section>
          <div className="rail-heading-row">
            <div className="rail-heading">Evidence filters</div>
            <button
              type="button"
              onClick={activeFilters.size + activeActivityFilters.size > 0 ? onClearFilters : onResetFilters}
            >
              {activeFilters.size + activeActivityFilters.size > 0 ? "Clear" : "Show all"}
            </button>
          </div>
          <div className="filter-list">
            {ENTRY_FILTERS.map((filter) => {
              const active = activeFilters.has(filter.id);
              return (
                <Fragment key={filter.id}>
                  <button
                    type="button"
                    aria-label={`${filter.label}, ${filterCounts[filter.id]}`}
                    aria-pressed={active}
                    data-active={active}
                    onClick={() => onToggleFilter(filter.id)}
                  >
                    <span className="filter-mark" aria-hidden="true"><span /></span>
                    <Icon name={filter.icon} size="sm" />
                    <span>{filter.label}</span>
                    <output>{filterCounts[filter.id]}</output>
                  </button>
                  {filter.id === "tools" ? (
                    <div className="tool-filter-list" aria-label="Tool types">
                      {TOOL_FILTERS.filter((toolFilter) => toolFilterCounts[toolFilter.id] > 0).map((toolFilter) => {
                        const toolActive = activeToolFilters.has(toolFilter.id);
                        return (
                          <button
                            key={toolFilter.id}
                            type="button"
                            aria-label={`${toolFilter.label}, ${toolFilterCounts[toolFilter.id]}`}
                            aria-pressed={toolActive}
                            data-active={toolActive}
                            onClick={() => onToggleToolFilter(toolFilter.id)}
                          >
                            <span className="filter-mark" aria-hidden="true"><span /></span>
                            <Icon name={toolFilter.icon} size="sm" />
                            <span>{toolFilter.label}</span>
                            <output>{toolFilterCounts[toolFilter.id]}</output>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
          </div>
          {track.truncated ? <p className="rail-note filter-count-note">Counts update as entries load.</p> : null}
        </section>
        <section className="activity-filter-section">
          <div className="rail-heading">Claude activity</div>
          <div className="activity-filter-grid" aria-label="Claude activity types">
            {ACTIVITY_FILTERS.filter((filter) => activityFilterCounts[filter.id] > 0).map((filter) => {
              const active = activeActivityFilters.has(filter.id);
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-label={`${filter.label}, ${activityFilterCounts[filter.id]}`}
                  aria-pressed={active}
                  data-active={active}
                  data-kind={filter.id}
                  onClick={() => onToggleActivityFilter(filter.id)}
                >
                  <Icon name={filter.icon} size="sm" />
                  <span>{filter.label}</span>
                  <output>{activityFilterCounts[filter.id]}</output>
                </button>
              );
            })}
          </div>
          {ACTIVITY_FILTERS.every((filter) => activityFilterCounts[filter.id] === 0) ? (
            <p className="rail-note">No Claude-specific activity in the loaded slice.</p>
          ) : null}
        </section>
        </>
      ) : (
        <section>
          <div className="rail-heading">Available evidence</div>
          <div className="capability-list">
            {capabilities.length > 0 ? capabilities.map(([name]) => (
              <span key={name}><Icon name="status" size="xs" />{name.replace(/([A-Z])/g, " $1")}</span>
            )) : <span className="muted">Basic messages only</span>}
          </div>
        </section>
      )}
      <section>
        <div className="rail-heading">Loaded session</div>
        <div className="slice-count">
          {track.entries.length.toLocaleString()}
          {track.summary.entryCount !== null
            ? ` of ${track.summary.entryCount.toLocaleString()}`
            : track.truncated ? "+" : ""} entries
        </div>
        <p className="rail-note"><span className={`live-indicator live-${liveState}`} />{liveState === "live" ? "Watching the local session for changes." : "Reconnecting to local updates."}</p>
      </section>
      <section>
        <div className="rail-heading">Layout</div>
        <div className="trace-order-control" role="group" aria-label="Trace order">
          <button
            type="button"
            aria-pressed={traceOrder === "oldest"}
            data-active={traceOrder === "oldest"}
            onClick={() => onTraceOrderChange("oldest")}
          >
            Oldest first
          </button>
          <button
            type="button"
            aria-pressed={traceOrder === "latest"}
            data-active={traceOrder === "latest"}
            onClick={() => onTraceOrderChange("latest")}
          >
            Latest first
          </button>
        </div>
      </section>
    </aside>
  );
}

function readTrackFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get("track");
}

export function App() {
  const [library, setLibrary] = useState<TrackLibraryResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(readTrackFromLocation);
  const [track, setTrack] = useState<Track | null>(null);
  const [viewer, setViewer] = useState<ViewerIdentity | null>(null);
  const [liveState, setLiveState] = useState<LiveState>("connecting");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mode, setMode] = useState<ViewMode>(readModeFromLocation);
  const [sidebarGroup, setSidebarGroup] = useState<SidebarGroupMode>(readSidebarGroupFromLocation);
  const [traceOrder, setTraceOrder] = useState<TraceOrder>(readTraceOrderFromLocation);
  const [traceQuery, setTraceQuery] = useState("");
  const [traceSearchMode, setTraceSearchMode] = useState<TraceSearchMode>("text");
  const [activeFilters, setActiveFilters] = useState<Set<EntryFilter>>(readFiltersFromLocation);
  const [activeToolFilters, setActiveToolFilters] = useState<Set<ToolIntent>>(readToolFiltersFromLocation);
  const [activeActivityFilters, setActiveActivityFilters] = useState<Set<ActivityKind>>(readActivityFiltersFromLocation);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackMoreError, setTrackMoreError] = useState<string | null>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [loadingTrackMore, setLoadingTrackMore] = useState(false);
  const [loadingLibraryMore, setLoadingLibraryMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef<string | null>(selectedId);
  const libraryRef = useRef<TrackLibraryResponse | null>(library);
  const libraryQueryRef = useRef(debouncedQuery);
  const trackRef = useRef<Track | null>(track);
  const traceOrderRef = useRef<TraceOrder>(traceOrder);
  const libraryRequestRef = useRef(0);
  const loadingTrackMoreRef = useRef(false);
  const loadingLibraryMoreRef = useRef(false);
  const liveRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLibrary = useCallback(async ({
    refresh = false,
    append = false,
  }: { refresh?: boolean; append?: boolean } = {}) => {
    if (append && loadingLibraryMoreRef.current) return;
    const current = libraryRef.current;
    const offset = append ? current?.nextOffset : 0;
    if (append && offset === null) return;
    const requestId = ++libraryRequestRef.current;
    if (append) {
      loadingLibraryMoreRef.current = true;
      setLoadingLibraryMore(true);
    } else if (refresh) {
      setRefreshing(true);
    }
    setLibraryError(null);
    try {
      const nextLibrary = await getTrackLibrary({
        refresh,
        query: debouncedQuery,
        offset: offset ?? 0,
        limit: LIBRARY_PAGE_SIZE,
      });
      if (requestId !== libraryRequestRef.current) return;
      setLibrary((loaded) => {
        if (!append || !loaded) return nextLibrary;
        const seen = new Set(loaded.tracks.map((item) => item.id));
        return {
          ...nextLibrary,
          offset: 0,
          tracks: [
            ...loaded.tracks,
            ...nextLibrary.tracks.filter((item) => !seen.has(item.id)),
          ],
        };
      });
      setSelectedId((selected) => selected ?? nextLibrary.tracks[0]?.id ?? null);
    } catch (error) {
      if (requestId === libraryRequestRef.current) {
        setLibraryError(error instanceof Error ? error.message : "Could not load sessions.");
      }
    } finally {
      if (append) {
        loadingLibraryMoreRef.current = false;
        setLoadingLibraryMore(false);
      } else if (refresh) {
        setRefreshing(false);
      }
    }
  }, [debouncedQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setLibrary(null);
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    void getViewerIdentity().then(setViewer).catch(() => setViewer(null));
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  useEffect(() => {
    libraryQueryRef.current = debouncedQuery;
  }, [debouncedQuery]);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  useEffect(() => {
    traceOrderRef.current = traceOrder;
  }, [traceOrder]);

  useEffect(() => {
    setTraceQuery("");
    setTraceSearchMode("text");
  }, [selectedId]);

  useEffect(() => {
    const events = new EventSource("/api/events");
    let closed = false;

    const refreshLiveData = () => {
      if (liveRefreshTimer.current) clearTimeout(liveRefreshTimer.current);
      liveRefreshTimer.current = setTimeout(() => {
        liveRefreshTimer.current = null;
        const trackId = selectedIdRef.current;
        const currentTrack = trackRef.current;
        const currentOrder = traceOrderRef.current;
        const libraryQuery = libraryQueryRef.current;
        let trackUpdate: Promise<Track | null> = Promise.resolve(null);
        if (trackId && currentTrack?.summary.id === trackId) {
          if (currentOrder === "latest") {
            trackUpdate = getTrackPage(trackId, {
              direction: "backward",
              limit: Math.min(Math.max(currentTrack.entries.length, TRACE_PAGE_SIZE), 2_000),
            });
          } else if (!currentTrack.truncated) {
            const startSequence = (currentTrack.entries.at(-1)?.sequence ?? -1) + 1;
            trackUpdate = getTrackPage(trackId, { startSequence, limit: TRACE_PAGE_SIZE });
          }
        }
        void Promise.all([
          getTrackLibrary({ query: libraryQuery, limit: LIBRARY_PAGE_SIZE }),
          trackUpdate,
        ]).then(([nextLibrary, nextTrack]) => {
          if (closed) return;
          setLibrary((loaded) => {
            if (!loaded) return nextLibrary;
            const headIds = new Set(nextLibrary.tracks.map((item) => item.id));
            const tracks = [
              ...nextLibrary.tracks,
              ...loaded.tracks.filter((item) => !headIds.has(item.id)),
            ].slice(0, Math.max(loaded.tracks.length, nextLibrary.tracks.length));
            return {
              ...nextLibrary,
              tracks,
              nextOffset: tracks.length < nextLibrary.total ? tracks.length : null,
            };
          });
          if (nextTrack && selectedIdRef.current === trackId) {
            setTrack((loaded) => {
              if (!loaded || loaded.summary.id !== trackId) return nextTrack;
              return currentOrder === "latest" ? nextTrack : mergeTrackPage(loaded, nextTrack);
            });
          }
        }).catch(() => {
          if (!closed) setLiveState("reconnecting");
        });
      }, 90);
    };

    events.onopen = () => setLiveState("live");
    events.addEventListener("connected", () => setLiveState("live"));
    events.addEventListener("catalog.updated", refreshLiveData);
    events.addEventListener("catalog.error", () => setLiveState("reconnecting"));
    events.onerror = () => setLiveState("reconnecting");

    return () => {
      closed = true;
      events.close();
      if (liveRefreshTimer.current) clearTimeout(liveRefreshTimer.current);
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", mode);
    if (sidebarGroup === "project") url.searchParams.set("group", "project");
    else url.searchParams.delete("group");
    if (traceOrder === "latest") url.searchParams.set("order", "latest");
    else url.searchParams.delete("order");
    url.searchParams.delete("type");
    if (activeFilters.size === 0) {
      url.searchParams.append("type", "none");
    } else if (activeFilters.size < ALL_ENTRY_FILTERS.length) {
      for (const filter of ALL_ENTRY_FILTERS) {
        if (activeFilters.has(filter)) url.searchParams.append("type", filter);
      }
    }
    url.searchParams.delete("tool");
    if (activeToolFilters.size === 0) {
      url.searchParams.append("tool", "none");
    } else if (activeToolFilters.size < ALL_TOOL_FILTERS.length) {
      for (const filter of ALL_TOOL_FILTERS) {
        if (activeToolFilters.has(filter)) url.searchParams.append("tool", filter);
      }
    }
    url.searchParams.delete("activity");
    if (activeActivityFilters.size === 0) {
      url.searchParams.append("activity", "none");
    } else if (activeActivityFilters.size < ALL_ACTIVITY_FILTERS.length) {
      for (const filter of ALL_ACTIVITY_FILTERS) {
        if (activeActivityFilters.has(filter)) url.searchParams.append("activity", filter);
      }
    }
    window.history.replaceState(null, "", url);
  }, [activeActivityFilters, activeFilters, activeToolFilters, mode, sidebarGroup, traceOrder]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTrack(null);
      return;
    }

    const controller = new AbortController();
    setLoadingTrack(true);
    setTrackError(null);
    setTrack(null);
    setTrackMoreError(null);
    void getTrackPage(selectedId, {
      direction: traceOrder === "latest" ? "backward" : "forward",
      limit: TRACE_PAGE_SIZE,
      signal: controller.signal,
    })
      .then((nextTrack) => {
        if (!controller.signal.aborted) setTrack(nextTrack);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setTrackError(error instanceof Error ? error.message : "Could not load this session.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTrack(false);
      });

    return () => controller.abort();
  }, [selectedId, traceOrder]);

  const loadMoreTrack = useCallback(() => {
    const current = trackRef.current;
    const trackId = selectedIdRef.current;
    if (!current || !trackId || !current.truncated || loadingTrackMoreRef.current) return;
    loadingTrackMoreRef.current = true;
    setLoadingTrackMore(true);
    setTrackMoreError(null);
    const request = traceOrderRef.current === "latest"
      ? getTrackPage(trackId, {
          direction: "backward",
          beforeSequence: current.entries[0]?.sequence ?? 0,
          limit: TRACE_PAGE_SIZE,
        })
      : getTrackPage(trackId, {
          startSequence: current.nextSequence ?? current.entries.length,
          limit: TRACE_PAGE_SIZE,
        });
    void request.then((page) => {
      if (selectedIdRef.current !== trackId) return;
      setTrack((loaded) => loaded?.summary.id === trackId ? mergeTrackPage(loaded, page) : loaded);
    }).catch((error: unknown) => {
      if (selectedIdRef.current === trackId) {
        setTrackMoreError(error instanceof Error ? error.message : "Could not load more entries.");
      }
    }).finally(() => {
      loadingTrackMoreRef.current = false;
      setLoadingTrackMore(false);
    });
  }, []);

  const visibleTracks = library?.tracks ?? [];

  const visibleTrackGroups = useMemo(() => {
    if (sidebarGroup === "project") {
      const grouped = new Map<string, { key: string; label: string; tracks: TrackSummary[] }>();
      for (const item of visibleTracks) {
        const existing = grouped.get(item.projectId);
        if (existing) existing.tracks.push(item);
        else grouped.set(item.projectId, {
          key: `project:${item.projectId}`,
          label: item.projectLabel,
          tracks: [item],
        });
      }
      return [...grouped.values()];
    }

    const grouped = new Map<SessionGroupLabel, TrackSummary[]>();
    for (const item of visibleTracks) {
      const label = sessionGroup(item.updatedAt);
      const group = grouped.get(label) ?? [];
      group.push(item);
      grouped.set(label, group);
    }
    return SESSION_GROUPS.flatMap((label) => {
      const tracks = grouped.get(label);
      return tracks?.length ? [{ key: `time:${label}`, label, tracks }] : [];
    });
  }, [sidebarGroup, visibleTracks]);

  const filterCounts = useMemo<Record<EntryFilter, number>>(() => {
    const counts: Record<EntryFilter, number> = {
      messages: 0,
      reasoning: 0,
      tools: 0,
      results: 0,
      status: 0,
      provider: 0,
    };
    for (const entry of track?.entries ?? []) counts[filterForEntry(entry)] += 1;
    return counts;
  }, [track]);

  const toolCallsById = useMemo(() => {
    const calls = new Map<string, ToolCallEntry>();
    for (const entry of track?.entries ?? []) {
      if (entry.kind === "tool_call" && entry.toolUseId) calls.set(entry.toolUseId, entry);
    }
    return calls;
  }, [track]);

  const toolFilterCounts = useMemo<Record<ToolIntent, number>>(() => {
    const counts: Record<ToolIntent, number> = {
      command: 0,
      read: 0,
      search: 0,
      edit: 0,
      create: 0,
      delete: 0,
      agent: 0,
      question: 0,
      calendar: 0,
      integration: 0,
      other: 0,
    };
    for (const entry of track?.entries ?? []) {
      if (entry.kind === "tool_call" && !entry.activity) counts[toolIntent(entry)] += 1;
    }
    return counts;
  }, [track]);

  const activityFilterCounts = useMemo<Record<ActivityKind, number>>(() => {
    const counts: Record<ActivityKind, number> = {
      skill: 0,
      mcp: 0,
      channel: 0,
      hook: 0,
      memory: 0,
      command: 0,
    };
    for (const entry of track?.entries ?? []) {
      if (entry.activity) counts[entry.activity.kind] += 1;
    }
    return counts;
  }, [track]);

  const visibleEntries = useMemo(() => {
    if (!track) return [];
    if (mode === "compact") {
      return track.entries.filter((entry) =>
        (entry.kind === "message" && entry.role !== "system")
        || (entry.kind === "tool_result" && entry.isError)
        || (entry.kind === "status" && (entry.tone === "warning" || entry.tone === "danger")),
      );
    }
    return track.entries.filter((entry) => {
      const relatedToolCall = entry.kind === "tool_result" && entry.toolUseId
        ? toolCallsById.get(entry.toolUseId)
        : undefined;
      const activity = activityForEntry(entry, relatedToolCall);
      if (activity) return activeActivityFilters.has(activity.kind);
      if (!activeFilters.has(filterForEntry(entry))) return false;
      if (entry.kind === "tool_call") return activeToolFilters.has(toolIntent(entry));
      if (entry.kind === "tool_result" && entry.toolUseId) {
        const call = toolCallsById.get(entry.toolUseId);
        return !call || activeToolFilters.has(toolIntent(call));
      }
      return true;
    });
  }, [activeActivityFilters, activeFilters, activeToolFilters, mode, toolCallsById, track]);

  const entrySearchIndex = useMemo(() => new Map(
    (track?.entries ?? []).map((entry) => [entry.id, entrySearchText(entry)]),
  ), [track?.entries]);

  const traceSearchResult = useMemo(() => {
    if (!traceQuery) return { entries: visibleEntries, error: null };

    if (traceSearchMode === "regex") {
      let pattern: RegExp;
      try {
        pattern = new RegExp(traceQuery, "i");
      } catch {
        return { entries: [] as TrackEntry[], error: "Invalid regular expression" };
      }
      return {
        entries: visibleEntries.filter((entry) => pattern.test(entrySearchIndex.get(entry.id) ?? "")),
        error: null,
      };
    }

    const normalizedQuery = traceQuery.toLowerCase();
    return {
      entries: visibleEntries.filter((entry) =>
        (entrySearchIndex.get(entry.id) ?? "").toLowerCase().includes(normalizedQuery),
      ),
      error: null,
    };
  }, [entrySearchIndex, traceQuery, traceSearchMode, visibleEntries]);

  const orderedVisibleEntries = useMemo(
    () => traceOrder === "latest"
      ? [...traceSearchResult.entries].reverse()
      : traceSearchResult.entries,
    [traceOrder, traceSearchResult.entries],
  );

  function toggleFilter(filter: EntryFilter) {
    setActiveFilters((current) => {
      const next = new Set(current);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }

  function toggleToolFilter(filter: ToolIntent) {
    setActiveToolFilters((current) => {
      const next = new Set(current);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }

  function toggleActivityFilter(filter: ActivityKind) {
    setActiveActivityFilters((current) => {
      const next = new Set(current);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }

  function selectTrack(trackId: string) {
    setSelectedId(trackId);
    setSidebarOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("track", trackId);
    window.history.replaceState(null, "", url);
  }

  const selectedSummary = library?.tracks.find((item) => item.id === selectedId)
    ?? (track?.summary.id === selectedId ? track.summary : null);

  return (
    <div className="app-shell" data-sidebar-open={sidebarOpen}>
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="Close session library"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className="library-panel">
        <header className="library-header">
          <div className="brand-lockup">
            <span className="brand-mark"><Icon name="brand" size="sm" /></span>
            <span>Tracks</span>
            <span className="local-badge">Local</span>
          </div>
          <IconButton label="Close session library" icon="close" onClick={() => setSidebarOpen(false)} />
        </header>
        <div className="search-wrap">
          <Icon name="search" size="sm" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
          />
          <kbd>/</kbd>
        </div>
        <div className="library-section-heading">
          <span>{debouncedQuery ? `${(library?.total ?? 0).toLocaleString()} results` : "Sessions"}</span>
          <div className="library-heading-actions">
            <label className="sidebar-group-control">
              <span className="sr-only">Group sessions by</span>
              <select
                aria-label="Group sessions by"
                value={sidebarGroup}
                onChange={(event) => setSidebarGroup(event.target.value as SidebarGroupMode)}
              >
                <option value="time">By time</option>
                <option value="project">By project</option>
              </select>
              <Icon name="disclosure" size="xs" />
            </label>
            <IconButton
              label="Refresh Claude sessions"
              icon="refresh"
              onClick={() => void loadLibrary({ refresh: true })}
              disabled={refreshing}
            />
          </div>
        </div>
        <div className="session-list" aria-busy={(!library && !libraryError) || loadingLibraryMore}>
          {!library && !libraryError ? Array.from({ length: 7 }, (_, index) => (
            <div className="session-skeleton" key={index} />
          )) : null}
          {libraryError ? <div className="inline-error"><Icon name="error" />{libraryError}</div> : null}
          {library && visibleTracks.length === 0 ? (
            <div className="library-empty">No sessions match this search.</div>
          ) : null}
          {visibleTrackGroups.map((group) => (
            <section className="session-group" key={group.key} aria-label={group.label}>
              <header className="session-group-heading">
                <span>{group.label}</span>
                <span>{group.tracks.length}</span>
              </header>
              {group.tracks.map((item) => (
                <SessionRow
                  key={item.id}
                  track={item}
                  selected={item.id === selectedId}
                  onSelect={() => selectTrack(item.id)}
                />
              ))}
            </section>
          ))}
          {library && library.nextOffset !== null ? (
            <InfiniteLoadSentinel
              loading={loadingLibraryMore}
              label="Load more sessions"
              error={libraryError}
              onLoad={() => void loadLibrary({ append: true })}
            />
          ) : null}
        </div>
        <footer className="library-footer">
          <span><span className={`health-dot live-${liveState}`} />{liveState === "live" ? "Live updates" : liveState === "reconnecting" ? "Reconnecting" : "Connecting"}</span>
          <span>{library ? `${library.total.toLocaleString()} sessions` : "—"}</span>
        </footer>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-identity">
            <IconButton label="Open session library" icon="sidebar" onClick={() => setSidebarOpen(true)} />
            <div className="breadcrumb">
              <span>{selectedSummary?.projectLabel ?? "Session library"}</span>
              {selectedSummary ? <><span aria-hidden="true">/</span><strong>{selectedSummary.title}</strong></> : null}
            </div>
          </div>
          <div className="workspace-actions">
            {track ? (
              <TraceSearch
                query={traceQuery}
                searchMode={traceSearchMode}
                matchCount={traceSearchResult.entries.length}
                totalCount={visibleEntries.length}
                error={traceSearchResult.error}
                onQueryChange={setTraceQuery}
                onSearchModeChange={setTraceSearchMode}
                onClear={() => setTraceQuery("")}
              />
            ) : null}
            <CopyButton value={window.location.href} label="Copy link" className="share-button" />
          </div>
        </header>

        <div className="workspace-body" data-mode={mode}>
          <section className="track-column" aria-busy={loadingTrack}>
            {!selectedId && library?.sourceState === "missing" ? (
              <EmptyPanel icon="project" title="Claude sessions were not found">
                Install or run Claude Code, or start Tracks with an explicit <code>--source</code> directory.
              </EmptyPanel>
            ) : null}
            {!selectedId && library?.sourceState === "ready" ? (
              <EmptyPanel icon="session" title="No sessions yet">
                Claude Code sessions will appear here without being copied or modified.
              </EmptyPanel>
            ) : null}
            {loadingTrack && !track ? (
              <div className="track-loading">
                <div className="hero-skeleton" />
                {Array.from({ length: 5 }, (_, index) => <div className="entry-skeleton" key={index} />)}
              </div>
            ) : null}
            {trackError ? <div className="track-error"><Icon name="error" />{trackError}</div> : null}
            {track ? (
              <>
                <header className="track-hero">
                  <div className="track-eyebrow">
                    <span className={`state-badge state-${track.summary.state}`}>
                      <span />{track.summary.state === "unknown" ? "Saved session" : track.summary.state}
                    </span>
                    <span>{formatDate(track.summary.startedAt)}</span>
                  </div>
                  <h1>{track.summary.title}</h1>
                  <div className="track-byline">
                    <span><Icon name="project" size="sm" />{track.summary.projectLabel}</span>
                    <span className="track-provider" title={track.summary.providerLabel}>
                      <ClaudeCodeIcon size={14} />
                      <span>{track.summary.providerLabel}</span>
                    </span>
                    <span>{formatBytes(track.summary.sourceBytes)}</span>
                  </div>
                  <ViewToggle mode={mode} onChange={setMode} />
                </header>
                <SessionOverview track={track} mode={mode} />
                {track.diagnostics.length > 0 ? (
                  <div className="diagnostic-banner">
                    <Icon name="warning" />
                    <span>{track.diagnostics.length} source {track.diagnostics.length === 1 ? "record needs" : "records need"} inspection. Valid surrounding entries are still shown.</span>
                  </div>
                ) : null}
                <div
                  className="trace"
                  data-mode={mode}
                  id="session-trace"
                  role="feed"
                  aria-label={mode === "compact" ? "Session highlights" : "Full session trace"}
                  aria-busy={loadingTrackMore}
                >
                  {orderedVisibleEntries.map((entry) => (
                    <EntryFrame
                      entry={entry}
                      key={entry.id}
                      relatedToolCall={entry.kind === "tool_result" && entry.toolUseId
                        ? toolCallsById.get(entry.toolUseId)
                        : undefined}
                      viewer={viewer}
                      totalEntries={track.summary.entryCount}
                    />
                  ))}
                  {traceSearchResult.entries.length === 0 ? (
                    <div className="trace-empty">
                      <span><Icon name={traceQuery ? "search" : "filter"} size="lg" /></span>
                      <strong>{traceSearchResult.error
                        ? "Invalid regular expression"
                        : traceQuery
                          ? track.truncated
                            ? "No matches in loaded entries yet"
                            : "No entries match this search"
                          : mode === "compact"
                            ? "No narrative entries in this slice"
                            : "No evidence matches"}</strong>
                      <p>{traceSearchResult.error
                        ? "Adjust the pattern or switch back to plain text."
                        : traceQuery
                          ? `No ${traceSearchMode === "regex" ? "regex" : "text"} matches in the ${track.truncated ? "loaded portion of the " : "current "}${mode === "compact" ? "Highlights" : "Full trace"}.`
                          : mode === "compact"
                            ? "Open Full view to inspect provider mechanics."
                            : "Enable one or more evidence filters to continue."}</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (traceQuery) {
                            setTraceQuery("");
                          } else if (mode === "compact") {
                            setMode("full");
                          } else {
                            setActiveFilters(new Set(ALL_ENTRY_FILTERS));
                            setActiveToolFilters(new Set(ALL_TOOL_FILTERS));
                            setActiveActivityFilters(new Set(ALL_ACTIVITY_FILTERS));
                          }
                        }}
                      >
                        {traceQuery ? "Clear search" : mode === "compact" ? "Open Full view" : "Show all evidence"}
                      </button>
                    </div>
                  ) : null}
                  {track.truncated && !traceSearchResult.error ? (
                    <InfiniteLoadSentinel
                      loading={loadingTrackMore}
                      label={traceQuery ? "Search more entries" : "Load more entries"}
                      error={trackMoreError}
                      autoLoad={!traceQuery || orderedVisibleEntries.length > 0}
                      onLoad={loadMoreTrack}
                    />
                  ) : null}
                </div>
                <TraceJumpNavigation key={track.summary.id} />
              </>
            ) : null}
          </section>
          {track ? (
            <DetailsRail
              track={track}
              mode={mode}
              liveState={liveState}
              traceOrder={traceOrder}
              activeFilters={activeFilters}
              activeToolFilters={activeToolFilters}
              activeActivityFilters={activeActivityFilters}
              filterCounts={filterCounts}
              toolFilterCounts={toolFilterCounts}
              activityFilterCounts={activityFilterCounts}
              onToggleFilter={toggleFilter}
              onToggleToolFilter={toggleToolFilter}
              onToggleActivityFilter={toggleActivityFilter}
              onResetFilters={() => {
                setActiveFilters(new Set(ALL_ENTRY_FILTERS));
                setActiveToolFilters(new Set(ALL_TOOL_FILTERS));
                setActiveActivityFilters(new Set(ALL_ACTIVITY_FILTERS));
              }}
              onClearFilters={() => {
                setActiveFilters(new Set());
                setActiveActivityFilters(new Set());
              }}
              onTraceOrderChange={setTraceOrder}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
