import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Track,
  TrackEntry,
  TrackSummary,
  ToolCallEntry,
} from "@tracks/core-model";
import { getTrack, getTrackLibrary, type TrackLibraryResponse } from "./api";
import { Icon, type IconName } from "./ui/Icon";

type ViewMode = "compact" | "full";

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

function summarizeInput(input: unknown): string {
  if (input === null || input === undefined) return "No arguments";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return "Structured arguments are unavailable";
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "No result content";
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return "Structured result is unavailable";
  }
}

function toolIcon(entry: ToolCallEntry): IconName {
  if (entry.category === "command") return "command";
  if (entry.category === "write") return "write";
  if (entry.category === "agent") return "agent";
  if (entry.category === "search" || entry.category === "read") return "search";
  return "tool";
}

function entryPresentation(entry: TrackEntry): { icon: IconName; label: string; tone: string } {
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
      return { icon: toolIcon(entry), label: entry.name, tone: entry.category };
    case "tool_result":
      return entry.isError
        ? { icon: "error", label: "Tool error", tone: "danger" }
        : { icon: "result", label: "Tool result", tone: "result" };
    case "status":
      return { icon: entry.tone === "danger" ? "error" : "status", label: entry.label, tone: entry.tone };
    case "unsupported":
      return { icon: "info", label: "Provider event", tone: "neutral" };
  }
}

function EntryBody({ entry }: { entry: TrackEntry }) {
  switch (entry.kind) {
    case "message":
      return <div className="entry-prose">{entry.text || <span className="muted">Empty message</span>}</div>;
    case "reasoning":
      return (
        <details className="reasoning-disclosure">
          <summary>
            <span>{entry.availability === "available" ? "Show reasoning" : "Reasoning unavailable"}</span>
            <Icon name="disclosure" size="sm" />
          </summary>
          {entry.text ? <div className="entry-prose reasoning-copy">{entry.text}</div> : null}
        </details>
      );
    case "tool_call":
      return (
        <div className="tool-surface">
          <div className="tool-caption">Arguments</div>
          <pre>{summarizeInput(entry.input)}</pre>
        </div>
      );
    case "tool_result": {
      const text = contentText(entry.content);
      return (
        <div className={`tool-surface result-surface${entry.isError ? " is-error" : ""}`}>
          <pre>{text.length > 8_000 ? `${text.slice(0, 8_000)}\n… output clipped in this view` : text}</pre>
        </div>
      );
    }
    case "status":
      return entry.detail ? <div className="entry-prose subtle-copy">{entry.detail}</div> : null;
    case "unsupported":
      return (
        <div className="unsupported-copy">
          <span>{entry.summary}</span>
          {entry.providerRecordKind ? <code>{entry.providerRecordKind}</code> : null}
        </div>
      );
  }
}

function EntryFrame({ entry }: { entry: TrackEntry }) {
  const presentation = entryPresentation(entry);
  return (
    <article className={`entry entry-${entry.kind} tone-${presentation.tone}`} id={`entry-${entry.id}`}>
      <div className="entry-rail" aria-hidden="true">
        <span className="entry-node">
          <Icon name={presentation.icon} size="sm" />
        </span>
      </div>
      <div className="entry-content">
        <header className="entry-header">
          <span className="entry-label">{presentation.label}</span>
          {entry.timestamp ? (
            <time dateTime={entry.timestamp} title={formatDate(entry.timestamp)}>
              {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
                new Date(entry.timestamp),
              )}
            </time>
          ) : null}
        </header>
        <EntryBody entry={entry} />
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
    <button className="session-row" data-selected={selected} onClick={onSelect} type="button">
      <span className="session-row-topline">
        <span className="session-project">{track.projectLabel}</span>
        <time dateTime={track.updatedAt} title={formatDate(track.updatedAt)}>
          {formatRelativeTime(track.updatedAt)}
        </time>
      </span>
      <span className="session-title">{track.title}</span>
      <span className="session-meta">
        <span className="provider-dot" aria-hidden="true" />
        {track.providerLabel}
        <span aria-hidden="true">·</span>
        {formatBytes(track.sourceBytes)}
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
    <div className="view-toggle" role="group" aria-label="Track view">
      <button type="button" data-active={mode === "compact"} onClick={() => onChange("compact")}>
        <Icon name="compact" size="sm" />
        Compact
      </button>
      <button type="button" data-active={mode === "full"} onClick={() => onChange("full")}>
        <Icon name="full" size="sm" />
        Full
      </button>
    </div>
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

function DetailsRail({ track }: { track: Track }) {
  const capabilities = Object.entries(track.summary.capabilities).filter(([, available]) => available);
  return (
    <aside className="details-rail" aria-label="Session details">
      <section>
        <div className="rail-heading">Session</div>
        <dl>
          <div><dt>Provider</dt><dd>{track.summary.providerLabel}</dd></div>
          <div><dt>Project</dt><dd>{track.summary.projectLabel}</dd></div>
          <div><dt>Started</dt><dd>{formatDate(track.summary.startedAt)}</dd></div>
          <div><dt>Source</dt><dd>{formatBytes(track.summary.sourceBytes)}</dd></div>
        </dl>
      </section>
      <section>
        <div className="rail-heading">Available evidence</div>
        <div className="capability-list">
          {capabilities.length > 0 ? capabilities.map(([name]) => (
            <span key={name}><Icon name="status" size="xs" />{name.replace(/([A-Z])/g, " $1")}</span>
          )) : <span className="muted">Basic messages only</span>}
        </div>
      </section>
      <section>
        <div className="rail-heading">Loaded slice</div>
        <div className="slice-count">{track.entries.length.toLocaleString()} entries</div>
        <p className="rail-note">Raw files remain authoritative. Tracks loads a bounded normalized view.</p>
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
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ViewMode>("compact");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  async function loadLibrary(refresh = false) {
    if (refresh) setRefreshing(true);
    setLibraryError(null);
    try {
      const nextLibrary = await getTrackLibrary(refresh);
      setLibrary(nextLibrary);
      setSelectedId((current) => current ?? nextLibrary.tracks[0]?.id ?? null);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Could not load sessions.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadLibrary();
  }, []);

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
    void getTrack(selectedId)
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
  }, [selectedId]);

  const visibleTracks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!library || !normalized) return library?.tracks ?? [];
    return library.tracks.filter((item) =>
      `${item.title} ${item.projectLabel} ${item.providerLabel}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [library, query]);

  const visibleEntries = useMemo(() => {
    if (!track || mode === "full") return track?.entries ?? [];
    return track.entries.filter((entry) =>
      entry.kind !== "reasoning"
      && entry.kind !== "unsupported"
      && !(entry.kind === "status" && entry.tone === "neutral")
      && !(entry.kind === "tool_result" && !entry.isError),
    );
  }, [mode, track]);

  function selectTrack(trackId: string) {
    setSelectedId(trackId);
    setSidebarOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("track", trackId);
    window.history.replaceState(null, "", url);
  }

  async function loadMore() {
    if (!track?.nextSequence) return;
    setLoadingMore(true);
    try {
      const next = await getTrack(track.summary.id, track.nextSequence);
      setTrack((current) => current ? {
        ...next,
        entries: [...current.entries, ...next.entries],
        diagnostics: [...current.diagnostics, ...next.diagnostics],
      } : next);
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : "Could not load more entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  const selectedSummary = library?.tracks.find((item) => item.id === selectedId) ?? null;

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
          <span>Recent sessions</span>
          <IconButton
            label="Refresh Claude sessions"
            icon="refresh"
            onClick={() => void loadLibrary(true)}
            disabled={refreshing}
          />
        </div>
        <div className="session-list" aria-busy={!library && !libraryError}>
          {!library && !libraryError ? Array.from({ length: 7 }, (_, index) => (
            <div className="session-skeleton" key={index} />
          )) : null}
          {libraryError ? <div className="inline-error"><Icon name="error" />{libraryError}</div> : null}
          {library && visibleTracks.length === 0 ? (
            <div className="library-empty">No sessions match this search.</div>
          ) : null}
          {visibleTracks.map((item) => (
            <SessionRow
              key={item.id}
              track={item}
              selected={item.id === selectedId}
              onSelect={() => selectTrack(item.id)}
            />
          ))}
        </div>
        <footer className="library-footer">
          <span><span className="health-dot" />{library?.sourceState === "ready" ? "Claude source ready" : "Checking Claude source"}</span>
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
            <ViewToggle mode={mode} onChange={setMode} />
            <button className="share-button" type="button" disabled title="Share workflow is the next product slice">
              <Icon name="share" size="sm" />
              Share
            </button>
          </div>
        </header>

        <div className="workspace-body">
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
                    <span><span className="provider-dot" />{track.summary.providerLabel}</span>
                    <span>{formatBytes(track.summary.sourceBytes)}</span>
                  </div>
                </header>
                {track.diagnostics.length > 0 ? (
                  <div className="diagnostic-banner">
                    <Icon name="warning" />
                    <span>{track.diagnostics.length} source {track.diagnostics.length === 1 ? "record needs" : "records need"} inspection. Valid surrounding entries are still shown.</span>
                  </div>
                ) : null}
                <div className="trace" data-mode={mode}>
                  {visibleEntries.map((entry) => <EntryFrame entry={entry} key={entry.id} />)}
                </div>
                {track.truncated ? (
                  <div className="load-more-wrap">
                    <button className="load-more" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                      <Icon name="disclosure" size="sm" />
                      {loadingMore ? "Loading…" : "Load more entries"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
          {track ? <DetailsRail track={track} /> : null}
        </div>
      </main>
    </div>
  );
}
