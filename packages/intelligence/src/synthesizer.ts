/**
 * Torvaix Workspace Knowledge Synthesizer
 *
 * Transforms fragmented memories and clusters into structured, actionable
 * workspace insights and knowledge-graph relational reinforcements.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  MemoryRecord,
  MemoryCluster,
  MemoryInsight,
  GraphReinforcementEdge,
  ConsolidationReport,
  KnowledgeCategory,
} from './types';
import { MemoryConsolidator } from './consolidator';

export class WorkspaceKnowledgeSynthesizer {
  private consolidator: MemoryConsolidator;

  constructor(consolidator?: MemoryConsolidator) {
    this.consolidator = consolidator ?? new MemoryConsolidator();
  }

  /**
   * Synthesizes high-level actionable insights from memory clusters.
   */
  synthesizeInsights(clusters: MemoryCluster[], allMemories: MemoryRecord[]): MemoryInsight[] {
    const memoryMap = new Map<string, MemoryRecord>();
    for (const m of allMemories) {
      memoryMap.set(m.id, m);
    }

    const insights: MemoryInsight[] = [];

    for (const cluster of clusters) {
      const supportingMemories = cluster.memoryIds
        .map(id => memoryMap.get(id))
        .filter((m): m is MemoryRecord => !!m);

      if (supportingMemories.length === 0) continue;

      const title = this.buildInsightTitle(cluster);
      const summary = this.buildInsightSummary(cluster, supportingMemories);
      const importance = this.calculateInsightImportance(cluster, supportingMemories);
      const actionable = cluster.category === 'task' || cluster.category === 'architecture';

      insights.push({
        id: uuidv4(),
        category: cluster.category,
        title,
        summary,
        supportingMemoryIds: cluster.memoryIds,
        importance,
        actionable,
        tags: cluster.keywords,
        createdAt: new Date().toISOString(),
      });
    }

    return insights.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Generates graph reinforcement edges from clusters.
   */
  generateGraphReinforcements(clusters: MemoryCluster[]): GraphReinforcementEdge[] {
    const edges: GraphReinforcementEdge[] = [];

    for (const cluster of clusters) {
      if (cluster.keywords.length >= 2) {
        const source = this.capitalize(cluster.keywords[0]);
        const target = this.capitalize(cluster.keywords[1]);
        const relation = this.determineRelationType(cluster.category);

        edges.push({
          sourceEntity: source,
          targetEntity: target,
          relation,
          weight: Math.min(1.0, 0.5 + cluster.size * 0.1),
          supportingClusterId: cluster.id,
        });

        // If cluster has 3+ keywords, create a secondary edge
        if (cluster.keywords.length >= 3) {
          const secondaryTarget = this.capitalize(cluster.keywords[2]);
          edges.push({
            sourceEntity: source,
            targetEntity: secondaryTarget,
            relation: 'ASSOCIATED_WITH',
            weight: 0.6,
            supportingClusterId: cluster.id,
          });
        }
      }
    }

    return edges;
  }

  /**
   * Runs the complete autonomous consolidation pipeline for a workspace.
   */
  consolidateWorkspace(workspaceId: string, memories: MemoryRecord[]): ConsolidationReport {
    // 1. Cluster memories
    const clusters = this.consolidator.clusterMemories(memories);

    // 2. Synthesize insights
    const synthesizedInsights = this.synthesizeInsights(clusters, memories);

    // 3. Generate graph reinforcement links
    const graphReinforcements = this.generateGraphReinforcements(clusters);

    // 4. Calculate health diagnostics
    const healthMetrics = this.consolidator.computeHealthMetrics(memories, clusters);

    // 5. Calculate count of deduplicated/condensed memories
    const deduplicatedCount = clusters
      .filter(c => c.size > 1)
      .reduce((acc, c) => acc + (c.size - 1), 0);

    return {
      workspaceId,
      processedCount: memories.length,
      deduplicatedCount,
      clustersCount: clusters.length,
      clusters,
      synthesizedInsights,
      reinforcedEdgesCount: graphReinforcements.length,
      graphReinforcements,
      healthMetrics,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Helper Formatter Methods ──

  private buildInsightTitle(cluster: MemoryCluster): string {
    const categoryLabels: Record<KnowledgeCategory, string> = {
      architecture: 'System Architecture',
      tech_stack: 'Core Technology',
      preference: 'User Preference',
      task: 'Pending Execution Task',
      domain_knowledge: 'Domain Fact',
      general: 'Workspace Knowledge',
    };

    const prefix = categoryLabels[cluster.category] || 'Knowledge';
    return `${prefix}: ${cluster.topic}`;
  }

  private buildInsightSummary(cluster: MemoryCluster, memories: MemoryRecord[]): string {
    if (memories.length === 1) {
      return memories[0].content;
    }

    // Synthesize multi-memory cluster
    const uniquePoints = Array.from(new Set(memories.map(m => m.content.trim())));
    if (uniquePoints.length === 1) {
      return `${uniquePoints[0]} (reaffirmed ${memories.length} times)`;
    }

    return uniquePoints.slice(0, 3).join(' • ');
  }

  private calculateInsightImportance(cluster: MemoryCluster, memories: MemoryRecord[]): number {
    let base = 5.0;

    // Cluster reinforcement: more memories discussing topic = higher importance
    base += Math.min(3.0, (cluster.size - 1) * 0.75);

    // Frequency reinforcement: total retrieval counts
    const totalRetrievals = memories.reduce((sum, m) => sum + (m.retrievalCount ?? 0), 0);
    base += Math.min(2.0, totalRetrievals * 0.3);

    // Category priority
    if (cluster.category === 'architecture' || cluster.category === 'preference') {
      base += 0.5;
    }

    return Number(Math.min(10.0, Math.max(1.0, base)).toFixed(1));
  }

  private determineRelationType(category: KnowledgeCategory): string {
    switch (category) {
      case 'architecture':
        return 'ARCHITECTURAL_COMPONENT_OF';
      case 'tech_stack':
        return 'INTEGRATED_WITH';
      case 'preference':
        return 'USER_PREFERS';
      case 'task':
        return 'BLOCKS_OR_ENABLES';
      case 'domain_knowledge':
        return 'CORRELATED_TO';
      default:
        return 'RELATED_TO';
    }
  }

  private capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
