import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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
