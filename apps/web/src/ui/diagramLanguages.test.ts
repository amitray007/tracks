import { describe, expect, it } from "vitest";
import { getDiagramDescriptor, getFenceLanguage } from "./diagramLanguages";

describe("diagram language detection", () => {
  it("normalizes renderable Mermaid and Graphviz aliases", () => {
    expect(getDiagramDescriptor("MMD")).toMatchObject({ format: "mermaid", renderable: true });
    expect(getDiagramDescriptor("gv")).toMatchObject({ format: "graphviz", renderable: true });
  });

  it("recognizes source-only diagram formats without claiming a renderer", () => {
    expect(getDiagramDescriptor("puml")).toMatchObject({ format: "plantuml", renderable: false });
    expect(getDiagramDescriptor("d2")).toMatchObject({ format: "d2", renderable: false });
  });

  it("does not intercept ordinary code fences", () => {
    expect(getDiagramDescriptor("typescript")).toBeUndefined();
    expect(getDiagramDescriptor(undefined)).toBeUndefined();
  });

  it("extracts a language from a markdown code class", () => {
    expect(getFenceLanguage("highlight language-mermaid extra")).toBe("mermaid");
    expect(getFenceLanguage(undefined)).toBeUndefined();
  });
});
