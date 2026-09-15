"use client";

import React, { useEffect, useState, useRef } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import dynamic from 'next/dynamic';
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });
import { useTheme } from 'next-themes';
import { countConnections } from '@/lib/graph';

interface Node {
  id: string;
  name: string;
  type: string;
  importance: number;
  val: number; // for graph sizing
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
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch('/api/graph')
      .then(res => {
        if (!res.ok) throw new Error(`Graph request failed with HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!data.nodes) return;

        const nodes: Node[] = data.nodes.map((n: any) => ({
          ...n,
          val: n.importance * 2, // Scale size based on importance
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
        console.error(err);
        setLoadError(true);
      })
      .finally(() => setLoaded(true));
  }, []);

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
          <h1 className="text-2xl font-bold tracking-tight mb-1">Knowledge Graph</h1>
          <p className="text-sm text-muted-foreground">Interactive visualization of all interconnected memories and entities.</p>
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
          className="flex-1 rounded-xl border border-border bg-[#0a0a0a] shadow-inner overflow-hidden relative"
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
                    Save a fact in chat (for example, &ldquo;Remember that I prefer PostgreSQL&rdquo;). With the Intelligence Layer running, entities and relationships appear here.
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
            nodeLabel="name"
            nodeColor={node => (node as Node).color || '#fff'}
            nodeRelSize={4}
            linkColor={() => isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleSpeed={d => (d as Link).confidence * 0.01}
            onNodeClick={(node) => {
              setSelectedNode(node as Node);
              // Center camera on clicked node
              if (fgRef.current) {
                fgRef.current.centerAt(node.x, node.y, 1000);
                fgRef.current.zoom(8, 2000);
              }
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = (node as Node).name;
              const fontSize = 12/globalScale;
              ctx.font = `${fontSize}px Inter, sans-serif`;
              const textWidth = ctx.measureText(label).width;
              const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); 
  
              ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
              if (node.x && node.y) {
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2 + 8, bckgDimensions[0], bckgDimensions[1]);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = (node as Node).color || (isDark ? '#fff' : '#000');
                ctx.fillText(label, node.x, node.y + 8);
                
                // Draw node circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, (node as Node).val, 0, 2 * Math.PI, false);
                ctx.fillStyle = (node as Node).color || '#fff';
                ctx.fill();
              }
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
                  {selectedNode.importance.toFixed(2)}
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
