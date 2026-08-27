/**
 * @torvaix/intelligence Types
 *
 * Types for autonomous memory consolidation, thematic clustering,
 * decay/reinforcement metrics, and workspace knowledge synthesis.
 */

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  source: string;
  content: string;
  createdAt: string;
  lastAccessedAt?: string;
  retrievalCount?: number;
  importance?: number;
}

export type KnowledgeCategory =
  | 'architecture'
  | 'tech_stack'
  | 'preference'
  | 'task'
  | 'domain_knowledge'
  | 'general';

export interface MemoryCluster {
  id: string;
  topic: string;
  category: KnowledgeCategory;
  confidence: number; // 0.0 - 1.0
  memoryIds: string[];
  primaryContent: string;
  keywords: string[];
  size: number;
}

export interface MemoryInsight {
  id: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  supportingMemoryIds: string[];
  importance: number; // 1.0 - 10.0
  actionable: boolean;
  tags: string[];
  createdAt: string;
}

export interface GraphReinforcementEdge {
  sourceEntity: string;
  targetEntity: string;
  relation: string;
  weight: number; // 0.0 - 1.0
  supportingClusterId: string;
}

export interface MemoryHealthMetrics {
  totalMemories: number;
  consolidatedRatio: number; // ratio of memories grouped into clusters
  avgAccessCount: number;
  staleMemoryCount: number; // unaccessed memories older than decay threshold
  recencyScore: number; // 0 - 100
  topThematicDomains: { theme: string; count: number }[];
  consolidationStatus: 'optimal' | 'needs_consolidation' | 'sparse';
}

export interface ConsolidationReport {
  workspaceId: string;
  processedCount: number;
  deduplicatedCount: number;
  clustersCount: number;
  clusters: MemoryCluster[];
  synthesizedInsights: MemoryInsight[];
  reinforcedEdgesCount: number;
  graphReinforcements: GraphReinforcementEdge[];
  healthMetrics: MemoryHealthMetrics;
  timestamp: string;
}
