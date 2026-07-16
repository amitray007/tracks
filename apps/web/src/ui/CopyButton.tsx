import { useEffect, useRef, useState } from "react";
import { copyText } from "./copyText";
import { Icon } from "./Icon";

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  async function handleCopy() {
    if (!(await copyText(value))) return;
    setCopied(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <button
      className={`copy-button${className ? ` ${className}` : ""}`}
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      data-copied={copied}
    >
      <Icon name={copied ? "status" : "copy"} size="xs" />
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
