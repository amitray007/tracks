import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ActivitySparkIcon,
  AlertCircleIcon,
  BrainCircuitIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ChevronDownIcon,
  CodeIcon,
  CommandLineIcon,
  FileEditIcon,
  Folder01Icon,
  GitBranchIcon,
  InformationCircleIcon,
  Layout01Icon,
  Link01Icon,
  Message02Icon,
  PanelLeftIcon,
  Refresh01Icon,
  Search01Icon,
  Share08Icon,
  SidebarLeftIcon,
  TerminalIcon,
  ToolsIcon,
  User02Icon,
  ViewAgendaIcon,
} from "@hugeicons/core-free-icons";

const iconRegistry = {
  agent: GitBranchIcon,
  assistant: ActivitySparkIcon,
  brand: ActivitySparkIcon,
  close: Cancel01Icon,
  command: CommandLineIcon,
  compact: ViewAgendaIcon,
  disclosure: ChevronDownIcon,
  error: AlertCircleIcon,
  full: Layout01Icon,
  info: InformationCircleIcon,
  link: Link01Icon,
  message: Message02Icon,
  project: Folder01Icon,
  reasoning: BrainCircuitIcon,
  refresh: Refresh01Icon,
  result: TerminalIcon,
  search: Search01Icon,
  session: CodeIcon,
  share: Share08Icon,
  sidebar: SidebarLeftIcon,
  status: CheckmarkCircle02Icon,
  tool: ToolsIcon,
  user: User02Icon,
  warning: AlertCircleIcon,
  write: FileEditIcon,
  panel: PanelLeftIcon,
} satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof iconRegistry;
export type IconSize = "xs" | "sm" | "md" | "lg";

const sizes: Record<IconSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
};

export interface IconProps {
  name: IconName;
  size?: IconSize;
  label?: string;
  className?: string;
}

export function Icon({ name, size = "md", label, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={iconRegistry[name]}
      size={sizes[size]}
      strokeWidth={1.5}
      color="currentColor"
      className={className}
      {...(label
        ? { "aria-label": label, role: "img" }
        : { "aria-hidden": true })}
    />
  );
}
