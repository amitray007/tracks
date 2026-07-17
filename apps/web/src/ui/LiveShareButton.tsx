import { useEffect, useRef, useState } from "react";
import { createLiveSessionShare } from "../api";
import { copyText } from "./copyText";
import { Icon } from "./Icon";

type ShareState = "idle" | "creating" | "live-copied" | "local-copied" | "failed";

export function LiveShareButton({
  trackId,
  fallbackUrl,
  sharedView,
  allowLocalFallback = true,
  className = "",
}: {
  trackId: string;
  fallbackUrl: string;
  sharedView: boolean;
  allowLocalFallback?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<ShareState>("idle");
  const [error, setError] = useState<string | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const resetLater = () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setState("idle");
      setError(null);
    }, 2_400);
  };

  async function share() {
    if (state === "creating") return;
    setError(null);
    setState("creating");
    try {
      if (sharedView) {
        if (!(await copyText(fallbackUrl))) throw new Error("The link could not be copied.");
        setState("live-copied");
      } else {
        try {
          const live = await createLiveSessionShare(trackId);
          if (!(await copyText(live.url))) throw new Error("The live link could not be copied.");
          setState("live-copied");
        } catch (liveError) {
          if (!allowLocalFallback) throw liveError;
          if (!(await copyText(fallbackUrl))) throw liveError;
          setError(liveError instanceof Error ? liveError.message : "Live sharing is unavailable.");
          setState("local-copied");
        }
      }
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "The link could not be copied.");
      setState("failed");
    }
    resetLater();
  }

  const label = state === "creating"
    ? "Creating live link…"
    : state === "live-copied"
      ? "Live link copied"
      : state === "local-copied"
        ? "Local link copied"
        : state === "failed"
          ? "Copy failed"
          : sharedView ? "Copy live link" : "Share session";

  return (
    <button
      className={`copy-button live-share-button${className ? ` ${className}` : ""}`}
      type="button"
      onClick={() => void share()}
      disabled={state === "creating"}
      aria-label={label}
      title={error ?? label}
      data-copied={state === "live-copied" || state === "local-copied"}
      data-local-fallback={state === "local-copied"}
    >
      <Icon name={state === "live-copied" || state === "local-copied" ? "status" : "link"} size="xs" />
      <span>{label}</span>
    </button>
  );
}
