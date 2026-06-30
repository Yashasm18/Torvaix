"use client";

import React, { useEffect, useState, useRef } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import dynamic from 'next/dynamic';
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });
import { useTheme } from 'next-themes';

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
  
  const isDark = theme === 'dark' || !theme; // Default to dark

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  useEffect(() => {
    fetch('/api/graph')
      .then(res => res.json())
      .then(data => {
        if (!data.nodes) return;
        
        const nodes: Node[] = data.nodes.map((n: any) => ({
          ...n,
          val: n.importance * 2, // Scale size based on importance
          color: TYPE_COLORS[n.type] || TYPE_COLORS.UNKNOWN
        }));
        
        const links: Link[] = data.edges.map((e: any) => ({
          ...e,
          source: e.source_id,
          target: e.target_id,
        }));
        
        setGraphData({ nodes, links });
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Init
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Knowledge Graph</h1>
          <p className="text-sm text-muted-foreground">Interactive visualization of all interconnected memories and entities.</p>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{type}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex flex-1 gap-6 overflow-hidden">
        <div 
          ref={containerRef} 
          className="flex-1 rounded-xl border border-border bg-[#0a0a0a] shadow-inner overflow-hidden relative"
        >
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
          <div className="w-80 flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm overflow-y-auto">
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
                  {graphData.links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).length} edges
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
