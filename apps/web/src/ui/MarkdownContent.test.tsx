import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent diagram fences", () => {
  it("routes Mermaid and DOT fences through the diagram renderer", () => {
    const mermaid = renderToStaticMarkup(<MarkdownContent value={"```mermaid\nflowchart LR\nA --> B\n```"} />);
    const graphviz = renderToStaticMarkup(<MarkdownContent value={"```dot\ndigraph { A -> B }\n```"} />);

    expect(mermaid).toContain('aria-label="Mermaid diagram"');
    expect(graphviz).toContain('aria-label="Graphviz diagram"');
  });

  it("keeps recognized source-only formats inspectable", () => {
    const html = renderToStaticMarkup(<MarkdownContent value={"```puml\nAlice -> Bob\n```"} />);

    expect(html).toContain('aria-label="PlantUML diagram"');
    expect(html).toContain("Alice -&gt; Bob");
    expect(html).toContain("Local preview is not available for PlantUML");
  });

  it("leaves ordinary code fences on the standard Markdown path", () => {
    const html = renderToStaticMarkup(<MarkdownContent value={"```ts\nconst value = 1;\n```"} />);

    expect(html).not.toContain("diagram-block");
    expect(html).toContain('class="language-ts"');
  });
});
