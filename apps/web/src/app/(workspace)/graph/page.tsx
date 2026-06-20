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

  useEffect(() => {
    // Fetch graph data
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
    // Handle resize
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
    </div>
  );
}
