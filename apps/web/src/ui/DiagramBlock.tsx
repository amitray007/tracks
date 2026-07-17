import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "./CopyButton";
import { Icon } from "./Icon";
import type { DiagramDescriptor } from "./diagramLanguages";

const MAX_DIAGRAM_SOURCE_LENGTH = 50_000;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

type RenderState =
  | { status: "idle" | "loading" }
  | { status: "ready"; svg: string; aspectRatio: number }
  | { status: "error"; message: string };

type VizInstance = Awaited<ReturnType<(typeof import("@viz-js/viz"))["instance"]>>;

let mermaidPromise: Promise<(typeof import("mermaid"))["default"]> | undefined;
let vizInstancePromise: Promise<VizInstance> | undefined;
let nextDiagramId = 0;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: "base",
        maxTextSize: MAX_DIAGRAM_SOURCE_LENGTH,
        maxEdges: 600,
        htmlLabels: false,
        flowchart: { htmlLabels: false, curve: "basis" },
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        secure: [
          "secure",
          "securityLevel",
          "startOnLoad",
          "maxTextSize",
          "theme",
          "themeCSS",
          "themeVariables",
          "fontFamily",
        ],
        themeVariables: {
          darkMode: true,
          background: "#101112",
          primaryColor: "#1b1d21",
          primaryTextColor: "#d9dade",
          primaryBorderColor: "#656b78",
          secondaryColor: "#20232a",
          secondaryTextColor: "#d9dade",
          secondaryBorderColor: "#707788",
          tertiaryColor: "#17191c",
          tertiaryTextColor: "#d9dade",
          tertiaryBorderColor: "#5e6471",
          lineColor: "#858b96",
          textColor: "#d9dade",
          mainBkg: "#1b1d21",
          nodeBorder: "#656b78",
          clusterBkg: "#15171a",
          clusterBorder: "#444951",
          edgeLabelBackground: "#101112",
          noteBkgColor: "#252217",
          noteTextColor: "#ded8c8",
          noteBorderColor: "#766e52",
          actorBkg: "#1b1d21",
          actorBorder: "#656b78",
          actorTextColor: "#d9dade",
          signalColor: "#a6abb4",
          signalTextColor: "#d9dade",
          labelBoxBkgColor: "#17191c",
          labelBoxBorderColor: "#555b67",
          labelTextColor: "#d9dade",
          loopTextColor: "#d9dade",
          activationBorderColor: "#767d8b",
          activationBkgColor: "#24272d",
          sequenceNumberColor: "#101112",
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

async function renderMermaid(source: string): Promise<string> {
  const mermaid = await loadMermaid();
  const id = `tracks-diagram-${++nextDiagramId}`;
  const rendered = await mermaid.render(id, source);
  return rendered.svg;
}

function themeGraphviz(svgSource: string): string {
  const document = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  const svg = document.documentElement;
  const background = svg.querySelector(":scope > g > polygon[fill='white'][stroke='transparent']");
  background?.setAttribute("fill", "transparent");

  svg.querySelectorAll("[stroke='black']").forEach((element) => element.setAttribute("stroke", "#9298a3"));
  svg.querySelectorAll("text[fill='black']").forEach((element) => element.setAttribute("fill", "#d7d9dd"));
  svg.querySelectorAll("polygon[fill='black']").forEach((element) => element.setAttribute("fill", "#9298a3"));
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  return new XMLSerializer().serializeToString(svg);
}

async function renderGraphviz(source: string): Promise<string> {
  if (!vizInstancePromise) {
    vizInstancePromise = import("@viz-js/viz").then(({ instance }) => instance());
  }
  const viz = await vizInstancePromise;
  return themeGraphviz(viz.renderSVGElement(source, { engine: "dot" }).outerHTML);
}

function sanitizeSvg(source: string): string {
  const sanitized = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["style"],
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"],
    FORBID_ATTR: ["href", "xlink:href", "src", "target"],
  });
  if (!sanitized.includes("<svg")) throw new Error("The renderer did not produce a valid SVG diagram.");
  return sanitized;
}

function readAspectRatio(svgSource: string): number {
  const document = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  const svg = document.querySelector("svg");
  const viewBox = svg?.getAttribute("viewBox")?.trim().split(/[ ,]+/).map(Number);
  const viewBoxWidth = viewBox?.[2];
  const viewBoxHeight = viewBox?.[3];
  if (viewBoxWidth !== undefined && viewBoxHeight !== undefined && viewBoxWidth > 0 && viewBoxHeight > 0) {
    return viewBoxWidth / viewBoxHeight;
  }

  const width = Number.parseFloat(svg?.getAttribute("width") ?? "");
  const height = Number.parseFloat(svg?.getAttribute("height") ?? "");
  return width > 0 && height > 0 ? width / height : 1.6;
}

function diagramDocument(svg: string, zoom: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; script-src 'none'"><style>html{color-scheme:dark;background:transparent}body{box-sizing:border-box;min-width:100%;margin:0;padding:20px;overflow:auto;background:transparent}svg{display:block;width:${Math.round(zoom * 100)}%;height:auto;margin:auto;overflow:visible}</style></head><body>${svg}</body></html>`;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The diagram could not be rendered.";
  return (message.replace(/^Error:\s*/i, "").split("\n")[0] ?? "The diagram could not be rendered.").slice(0, 220);
}

export function DiagramBlock({ source, descriptor }: { source: string; descriptor: DiagramDescriptor }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [frameWidth, setFrameWidth] = useState(640);
  const [renderState, setRenderState] = useState<RenderState>({ status: "idle" });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: "480px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !("ResizeObserver" in window)) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setFrameWidth(entry.contentRect.width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || !descriptor.renderable) return;
    if (source.length > MAX_DIAGRAM_SOURCE_LENGTH) {
      setRenderState({ status: "error", message: "This diagram is too large to preview safely." });
      return;
    }

    let cancelled = false;
    setRenderState({ status: "loading" });
    const renderer = descriptor.format === "mermaid" ? renderMermaid : renderGraphviz;
    void renderer(source)
      .then((svg) => sanitizeSvg(svg))
      .then((svg) => {
        if (!cancelled) setRenderState({ status: "ready", svg, aspectRatio: readAspectRatio(svg) });
      })
      .catch((error: unknown) => {
        if (!cancelled) setRenderState({ status: "error", message: errorMessage(error) });
      });
    return () => { cancelled = true; };
  }, [descriptor.format, descriptor.renderable, nearViewport, source]);

  const frameHeight = renderState.status === "ready"
    ? Math.min(560, Math.max(210, (frameWidth - 40) / renderState.aspectRatio + 40))
    : 260;
  const sourceIsVisible = showSource || !descriptor.renderable || renderState.status === "error";
  const srcDoc = useMemo(
    () => renderState.status === "ready" ? diagramDocument(renderState.svg, zoom) : undefined,
    [renderState, zoom],
  );

  function adjustZoom(change: number) {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + change)));
  }

  return (
    <section className="diagram-block" ref={hostRef} aria-label={`${descriptor.label} diagram`}>
      <header className="diagram-toolbar">
        <span className="diagram-identity"><Icon name="diagram" size="xs" />{descriptor.label}</span>
        <span className="diagram-actions">
          {renderState.status === "ready" && !sourceIsVisible ? (
            <span className="diagram-zoom" aria-label="Diagram zoom controls">
              <button type="button" onClick={() => adjustZoom(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" title="Zoom out"><Icon name="minus" size="xs" /></button>
              <button className="diagram-zoom-level" type="button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label={`Reset zoom from ${Math.round(zoom * 100)} percent`}>{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => adjustZoom(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in"><Icon name="add" size="xs" /></button>
            </span>
          ) : null}
          {descriptor.renderable && renderState.status !== "error" ? (
            <button className="diagram-source-toggle" type="button" onClick={() => setShowSource((visible) => !visible)} aria-pressed={sourceIsVisible}>
              <Icon name="source" size="xs" />{sourceIsVisible ? "Preview" : "Source"}
            </button>
          ) : null}
          <CopyButton value={source} label="Copy source" className="diagram-copy" />
        </span>
      </header>

      {sourceIsVisible ? (
        <pre className="diagram-source"><code>{source}</code></pre>
      ) : renderState.status === "ready" && srcDoc ? (
        <iframe
          className="diagram-frame"
          srcDoc={srcDoc}
          sandbox=""
          title={`${descriptor.label} diagram preview`}
          height={frameHeight}
        />
      ) : (
        <div className="diagram-loading" role="status">
          <span className="diagram-loading-mark" />
          {renderState.status === "loading" ? `Rendering ${descriptor.label}…` : `${descriptor.label} preview will render when visible`}
        </div>
      )}

      {!descriptor.renderable ? (
        <footer className="diagram-note">Local preview is not available for {descriptor.label}; the source remains fully inspectable.</footer>
      ) : renderState.status === "error" ? (
        <footer className="diagram-note diagram-error" role="note"><Icon name="warning" size="xs" />{renderState.message}</footer>
      ) : null}
    </section>
  );
}
