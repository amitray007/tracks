import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { DiagramBlock } from "./DiagramBlock";
import { getDiagramDescriptor, getFenceLanguage } from "./diagramLanguages";

function textContent(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textContent).join("");
  return "";
}

const markdownComponents: Components = {
  a({ href, children }) {
    const external = href?.startsWith("http://") || href?.startsWith("https://");
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return <div className="markdown-table-wrap"><table>{children}</table></div>;
  },
  pre({ children }) {
    if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
      const descriptor = getDiagramDescriptor(getFenceLanguage(children.props.className));
      if (descriptor) {
        return <DiagramBlock descriptor={descriptor} source={textContent(children.props.children).replace(/\n$/, "")} />;
      }
    }
    return <pre>{children}</pre>;
  },
};

function normalizeMarkdown(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function MarkdownContent({ value }: { value: string }) {
  if (!value.trim()) return <span className="muted">Empty message</span>;
  return (
    <ReactMarkdown
      components={markdownComponents}
      remarkPlugins={[remarkGfm]}
      skipHtml
    >
      {normalizeMarkdown(value)}
    </ReactMarkdown>
  );
}
