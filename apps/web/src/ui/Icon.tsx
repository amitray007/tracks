import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ActivitySparkIcon,
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  BrainCircuitIcon,
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ChevronDownIcon,
  CodeIcon,
  CommandLineIcon,
  Copy01Icon,
  Delete02Icon,
  FileAddIcon,
  FileEditIcon,
  FileViewIcon,
  FilterIcon,
  Folder01Icon,
  GitBranchIcon,
  InformationCircleIcon,
  Layout01Icon,
  Link01Icon,
  Message02Icon,
  PanelLeftIcon,
  Plug01Icon,
  Refresh01Icon,
  Search01Icon,
  Share08Icon,
  SidebarLeftIcon,
  TerminalIcon,
  ToolsIcon,
  User02Icon,
  UserQuestion01Icon,
  ViewAgendaIcon,
} from "@hugeicons/core-free-icons";

const iconRegistry = {
  agent: GitBranchIcon,
  assistant: ActivitySparkIcon,
  brand: ActivitySparkIcon,
  calendar: Calendar03Icon,
  close: Cancel01Icon,
  command: CommandLineIcon,
  compact: ViewAgendaIcon,
  copy: Copy01Icon,
  create: FileAddIcon,
  delete: Delete02Icon,
  disclosure: ChevronDownIcon,
  down: ArrowDown01Icon,
  error: AlertCircleIcon,
  edit: FileEditIcon,
  filter: FilterIcon,
  full: Layout01Icon,
  info: InformationCircleIcon,
  integration: Plug01Icon,
  link: Link01Icon,
  message: Message02Icon,
  project: Folder01Icon,
  question: UserQuestion01Icon,
  read: FileViewIcon,
  reasoning: BrainCircuitIcon,
  refresh: Refresh01Icon,
  result: TerminalIcon,
  search: Search01Icon,
  session: CodeIcon,
  share: Share08Icon,
  sidebar: SidebarLeftIcon,
  status: CheckmarkCircle02Icon,
  tool: ToolsIcon,
  up: ArrowUp01Icon,
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
