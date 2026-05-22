"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fetchNetwork } from "@/lib/api";

export function NetworkView({ rootId }: { rootId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["network", rootId],
    queryFn: () => fetchNetwork(rootId, 2),
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || !data) return;
    let cancelled = false;

    (async () => {
      const cytoscapeModule = await import("cytoscape");
      const cytoscape = cytoscapeModule.default;

      try {
        // @ts-expect-error — cose-bilkent has no types
        const cose = (await import("cytoscape-cose-bilkent")).default;
        cytoscape.use(cose);
      } catch {
        // layout already registered
      }

      if (cancelled || !containerRef.current) return;

      const cy = cytoscape({
        container: containerRef.current,
        elements: [
          ...data.nodes.map((n: any) => ({
            data: {
              id: n.id,
              label: n.label,
              type: n.type,
              size: Math.max(20, n.size ?? 30),
            },
            style: {
              "background-color": n.color,
            },
          })),
          ...data.edges.map((e: any, i: number) => ({
            data: {
              id: `edge_${i}`,
              source: e.from,
              target: e.to,
              weight: e.weight,
              kind: e.kind,
            },
          })),
        ],
        style: [
          {
            selector: "node",
            style: {
              label: "data(label)",
              "font-size": 10,
              width: "data(size)",
              height: "data(size)",
              "text-margin-y": -8,
              color: "#0a0a0a",
            },
          },
          {
            selector: "edge",
            style: {
              "line-color": "#d4d4d4",
              "curve-style": "bezier",
              width: 1,
              opacity: 0.6,
            },
          },
          {
            selector: `node[id = "${rootId}"]`,
            style: {
              "border-width": 3,
              "border-color": "#0a0a0a",
            },
          },
        ],
        layout: {
          name: "cose-bilkent" as any,
          animationDuration: 500,
        } as any,
        minZoom: 0.3,
        maxZoom: 3,
      });

      cyRef.current = cy;
    })();

    return () => {
      cancelled = true;
      (cyRef.current as { destroy?: () => void } | null)?.destroy?.();
    };
  }, [data, rootId]);

  if (isLoading) {
    return <div className="h-[500px] bg-neutral-100 rounded-xl animate-pulse" />;
  }

  if (!data || data.nodes.length <= 1) {
    return (
      <div className="h-[500px] cy-container flex items-center justify-center text-neutral-500">
        No connections to show yet. (Run the worker to build the graph.)
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="cy-container h-[500px]" />
      <div className="text-xs text-neutral-500 flex justify-between">
        <span>
          {data.nodes.length} nodes · {data.edges.length} connections
        </span>
        <span>Drag to pan · Scroll to zoom · Click for details</span>
      </div>
    </div>
  );
}
