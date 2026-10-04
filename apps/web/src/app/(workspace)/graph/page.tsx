"use client";

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });
import { useTheme } from 'next-themes';
import { countConnections, fitZoom, linkEndpointId, nodeRadius, relationLabel, shortLabel } from '@/lib/graph';
import { useActiveWorkspace } from '@/hooks/use-active-workspace';

interface Node {
  id: string;
  name: string;
  type: string;
  importance: number;
  radius: number; // on the canvas, in graph units
  color?: string;
}

interface Link {
  source: string;
  target: string;
  relation: string;
  confidence: number;
}

const TYPE_COLORS: Record<string, string> = {
  PROJECT: '#00D4AA', // primary cyan
  TECHNOLOGY: '#3b82f6', // blue
  PERSON: '#f59e0b', // amber
  TASK: '#ef4444', // red
  MEMORY: '#a855f7', // purple
  UNKNOWN: '#94a3b8' // slate
};

export default function GraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: Node[], links: Link[] }>({ nodes: [], links: [] });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const { theme } = useTheme();
  
  const isDark = theme !== 'light'; // every theme except "light" has a dark background

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { workspace, workspaceId } = useActiveWorkspace();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setLoaded(false);
    setSelectedNode(null);
    fetch(`/api/graph?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(res => {
        if (!res.ok) throw new Error(`Graph request failed with HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled || !data.nodes) return;

        const nodes: Node[] = data.nodes.map((n: any) => ({
          ...n,
          radius: nodeRadius(n.importance),
          color: TYPE_COLORS[n.type] || TYPE_COLORS.UNKNOWN
        }));

        const links: Link[] = (data.edges ?? []).map((e: any) => ({
          ...e,
          source: e.source_id,
          target: e.target_id,
        }));

        setGraphData({ nodes, links });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Layout settings and the first fit are applied once per loaded graph. They can't be set in
  // an effect: the graph component is loaded on demand and may not exist yet when data arrives.
  const configuredFor = useRef<object | null>(null);
  const fittedFor = useRef<object | null>(null);

  const configureLayout = () => {
    const fg = fgRef.current;
    if (!fg || configuredFor.current === graphData) return;
    configuredFor.current = graphData;
    const radiusOf = (end: unknown) => graphData.nodes.find((n) => n.id === linkEndpointId(end))?.radius ?? nodeRadius(5);
    // The default link length (30) is shorter than two node circles, so connected nodes sat
    // on top of each other and hid both the link and the labels.
    fg.d3Force('link')?.distance((link: Link) => radiusOf(link.source) + radiusOf(link.target) + 80);
    fg.d3Force('charge')?.strength(-260);
    fg.d3ReheatSimulation();
  };

  const fitToView = () => {
    const fg = fgRef.current;
    if (!fg || fittedFor.current === graphData || graphData.nodes.length === 0) return;
    fittedFor.current = graphData;
    const box = fg.getGraphBbox();
    if (!box) return;
    const [minX, maxX] = box.x;
    const [minY, maxY] = box.y;
    fg.centerAt((minX + maxX) / 2, (minY + maxY) / 2, 400);
    fg.zoom(fitZoom(dimensions, { width: maxX - minX, height: maxY - minY }), 400);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setDimensions({ width: container.clientWidth, height: container.clientHeight });
    };

    // Observe the container, not the window: the resizable side panel and the
    // collapsible sidebar change its size without firing a window resize.
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-background p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[14rem]">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Knowledge graph</h1>
          <p className="text-sm text-muted-foreground">
            Entities and relationships saved in {workspace?.name ?? 'this workspace'}.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0 gap-6 overflow-hidden">
        <div
          ref={containerRef}
          className="flex-1 rounded-xl border border-border bg-surface shadow-inner overflow-hidden relative"
        >
          {loaded && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-6 text-center pointer-events-none">
              {loadError ? (
                <>
                  <p className="text-sm font-medium text-foreground">Couldn&apos;t load the knowledge graph</p>
                  <p className="max-w-sm text-xs text-muted-foreground">Refresh the page to try again.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">Your knowledge graph is empty</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Save a few related facts in chat (for example, &ldquo;Remember that I prefer PostgreSQL&rdquo;). The graph fills in as Torvaix finds connections between them, in more detail when the optional NLP service is running.
                  </p>
                </>
              )}
            </div>
          )}
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeLabel={(node) => `${(node as Node).name} (${(node as Node).type.toLowerCase()})`}
            nodeColor={node => (node as Node).color || '#fff'}
            linkColor={() => isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)'}
            linkWidth={1}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={0.5}
            cooldownTicks={140}
            onEngineTick={configureLayout}
            onEngineStop={fitToView}
            onNodeClick={(node) => {
              setSelectedNode(node as Node);
              // Center camera on clicked node
              if (fgRef.current) {
                fgRef.current.centerAt(node.x, node.y, 600);
                fgRef.current.zoom(2.5, 600);
              }
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as Node;
              if (typeof node.x !== 'number' || typeof node.y !== 'number') return;

              ctx.beginPath();
              ctx.arc(node.x, node.y, n.radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = n.color || '#fff';
              ctx.fill();
              if (selectedNode?.id === n.id) {
                ctx.lineWidth = 2 / globalScale;
                ctx.strokeStyle = isDark ? '#fff' : '#000';
                ctx.stroke();
              }

              // The name goes under the circle. It used to be drawn first, at the centre, and
              // the circle was then painted over it.
              const label = shortLabel(n.name);
              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px Inter, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const labelY = node.y + n.radius + fontSize * 0.9;
              ctx.fillStyle = isDark ? 'rgba(10, 14, 26, 0.75)' : 'rgba(255, 255, 255, 0.8)';
              ctx.fillRect(node.x - textWidth / 2 - fontSize * 0.3, labelY - fontSize * 0.65, textWidth + fontSize * 0.6, fontSize * 1.3);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)';
              ctx.fillText(label, node.x, labelY);
            }}
            nodePointerAreaPaint={(node, color, ctx) => {
              if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, (node as Node).radius + 2, 0, 2 * Math.PI, false);
              ctx.fill();
            }}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link, ctx, globalScale) => {
              // How two things are related, written on the link once it's large enough to read.
              const source = link.source as { x?: number; y?: number } | string | undefined;
              const target = link.target as { x?: number; y?: number } | string | undefined;
              if (!source || !target || typeof source === 'string' || typeof target === 'string') return;
              if (typeof source.x !== 'number' || typeof source.y !== 'number' || typeof target.x !== 'number' || typeof target.y !== 'number') return;
              const text = relationLabel((link as Link).relation);
              if (!text || globalScale < 0.7) return;

              const fontSize = 10 / globalScale;
              ctx.font = `${fontSize}px Inter, sans-serif`;
              const x = (source.x + target.x) / 2;
              const y = (source.y + target.y) / 2 - fontSize;
              const width = ctx.measureText(text).width;
              ctx.fillStyle = isDark ? 'rgba(10, 14, 26, 0.75)' : 'rgba(255, 255, 255, 0.8)';
              ctx.fillRect(x - width / 2 - fontSize * 0.3, y - fontSize * 0.65, width + fontSize * 0.6, fontSize * 1.3);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
              ctx.fillText(text, x, y);
            }}
          />
        </div>

        {/* Selected Node Details Panel */}
        {selectedNode && (
          <div className="absolute inset-x-3 bottom-3 z-20 max-h-[60%] md:static md:inset-auto md:max-h-none md:w-80 flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{selectedNode.name}</h2>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                Close
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Type</h3>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: selectedNode.color + '20', color: selectedNode.color }}>
                  {selectedNode.type}
                </span>
              </div>
              
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Importance Score</h3>
                <p className="text-sm font-mono bg-muted/50 p-2 rounded-md border border-border/50">
                  {(selectedNode.importance ?? 5).toFixed(2)}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">ID</h3>
                <p className="text-xs font-mono text-muted-foreground break-all">
                  {selectedNode.id}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Connections</h3>
                <p className="text-sm text-muted-foreground">
                  {countConnections(graphData.links, selectedNode.id)} edges
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
