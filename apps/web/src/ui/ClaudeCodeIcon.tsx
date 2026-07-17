import claudeCodeIconUrl from "@lobehub/icons-static-svg/icons/claude-color.svg";

export function ClaudeCodeIcon({
  size = 18,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <img
      src={claudeCodeIconUrl}
      width={size}
      height={size}
      className={className}
      {...(label ? { alt: label, title: label } : { alt: "", "aria-hidden": true })}
    />
  );
}
