export type DiagramFormat = "mermaid" | "graphviz" | "plantuml" | "d2" | "nomnoml" | "svgbob";

export interface DiagramDescriptor {
  format: DiagramFormat;
  label: string;
  renderable: boolean;
}

const diagramLanguages: Record<string, DiagramDescriptor> = {
  mermaid: { format: "mermaid", label: "Mermaid", renderable: true },
  mmd: { format: "mermaid", label: "Mermaid", renderable: true },
  dot: { format: "graphviz", label: "Graphviz", renderable: true },
  graphviz: { format: "graphviz", label: "Graphviz", renderable: true },
  gv: { format: "graphviz", label: "Graphviz", renderable: true },
  plantuml: { format: "plantuml", label: "PlantUML", renderable: false },
  puml: { format: "plantuml", label: "PlantUML", renderable: false },
  d2: { format: "d2", label: "D2", renderable: false },
  nomnoml: { format: "nomnoml", label: "Nomnoml", renderable: false },
  svgbob: { format: "svgbob", label: "Svgbob", renderable: false },
  bob: { format: "svgbob", label: "Svgbob", renderable: false },
};

export function getDiagramDescriptor(language: string | undefined): DiagramDescriptor | undefined {
  if (!language) return undefined;
  return diagramLanguages[language.trim().toLowerCase()];
}

export function getFenceLanguage(className: string | undefined): string | undefined {
  return className?.split(/\s+/).find((name) => name.startsWith("language-"))?.slice("language-".length);
}
