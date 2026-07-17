import type { SubAgentEntry } from "@tracks/core-model";
import { Icon } from "../ui/Icon";

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function durationLabel(milliseconds: number): string {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function SubAgentEventBody({
  entry,
  onOpenTrack,
}: {
  entry: SubAgentEntry;
  onOpenTrack: ((trackId: string) => void) | undefined;
}) {
  return (
    <div className="subagent-entry-card" data-status={entry.status}>
      <header>
        <span><Icon name="agent" size="sm" />Sub-agent transcript</span>
        <span className="subagent-status">{humanize(entry.status)}</span>
      </header>
      <div className="subagent-entry-copy">
        <strong>{entry.objective ?? entry.label ?? "Delegated task"}</strong>
        {entry.label ? <span>{humanize(entry.label)}</span> : null}
      </div>
      <footer>
        <span>{entry.durationMs !== null && entry.durationMs !== undefined
          ? durationLabel(entry.durationMs)
          : "Linked Claude work"}</span>
        {entry.childTrackId && onOpenTrack ? (
          <button type="button" onClick={() => onOpenTrack(entry.childTrackId!)}>
            Open transcript
            <Icon name="link" size="xs" />
          </button>
        ) : <span>{entry.childTrackId ? "Transcript not included" : "Transcript unavailable"}</span>}
      </footer>
    </div>
  );
}
