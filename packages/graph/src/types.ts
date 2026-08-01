export interface GraphNode {
  id: string; // The text of the entity, slugified or lowercased
  name: string; // The original display text
  type: string; // PERSON, PROJECT, TECHNOLOGY, etc.
  importance: number; // 1-10 scale
  degree?: number; // Total number of connected edges (centrality)
  metadata?: string; // JSON string for extra fields
  created_at: string;
}

export interface GraphEdge {
  id: string; // UUID or deterministic hash
  source_id: string;
  relation: string; // USES, CREATED, RELATED_TO, etc.
  target_id: string;
  confidence: number; // 0.0 - 1.0
  frequency?: number; // Ingestion repetition count
}

export interface EgoGraphResult {
  center: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
}

export interface QueryGraphOptions {
  search?: string;
  type?: string;
  minImportance?: number;
  limit?: number;
  offset?: number;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  entityTypeCounts: Record<string, number>;
  topHubs: { name: string; type: string; degree: number; importance: number }[];
}
