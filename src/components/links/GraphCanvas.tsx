import { useEffect, useRef } from "react";
import type { Graph } from "@/lib/link-graph";
import { LINK_LABEL } from "@/lib/link-graph";

/** Cytoscape graph. Loaded only in the browser; colours come from the theme tokens at runtime. */
export function GraphCanvas({ graph, onNode, onEdge }: { graph: Graph; onNode: (id: string) => void; onEdge: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onNode, onEdge });
  cbs.current = { onNode, onEdge };
  useEffect(() => {
    let cy: { destroy: () => void } | null = null;
    let cancelled = false;
    void import("cytoscape").then(({ default: cytoscape }) => {
      if (cancelled || !ref.current) return;
      const css = getComputedStyle(ref.current);
      const tok = (n: string) => css.getPropertyValue(n).trim() || "currentColor";
      const inst = cytoscape({
        container: ref.current,
        elements: [
          ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type } })),
          ...graph.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: LINK_LABEL[e.type] } })),
        ],
        layout: { name: "cose", animate: false, padding: 24 },
        style: [
          { selector: "node", style: { "background-color": tok("--primary"), label: "data(label)", color: tok("--foreground"), "font-size": 12, "text-valign": "bottom", "text-margin-y": 6, width: 28, height: 28 } },
          { selector: 'node[type = "account"]', style: { "background-color": tok("--color-positive") } },
          { selector: 'node[type = "narrative"], node[type = "hashtag"]', style: { "background-color": tok("--color-caution"), shape: "round-rectangle" } },
          { selector: 'node[type = "phone"], node[type = "location"], node[type = "url"]', style: { "background-color": tok("--muted-foreground"), shape: "diamond" } },
          { selector: "edge", style: { width: 2, "line-color": tok("--border"), "curve-style": "bezier", label: "data(label)", "font-size": 10, color: tok("--muted-foreground"), "text-rotation": "autorotate" } },
          { selector: ":selected", style: { "border-width": 3, "border-color": tok("--ring"), "line-color": tok("--ring") } },
        ],
      });
      inst.on("tap", "node", (ev) => cbs.current.onNode(ev.target.id()));
      inst.on("tap", "edge", (ev) => cbs.current.onEdge(ev.target.id()));
      cy = inst;
    });
    return () => { cancelled = true; cy?.destroy(); };
  }, [graph]);
  return <div ref={ref} role="img" aria-label="Link graph. Use the lists beside the graph to open entities and links with the keyboard." className="bg-card border-border h-[480px] w-full rounded-lg border" />;
}
