/**
 * Torvaix Memory Consolidator
 *
 * Provides deterministic, local-first memory clustering, deduplication,
 * recency decay modeling, and access-frequency reinforcement.
 */

import { v4 as uuidv4 } from 'uuid';
import { MemoryRecord, MemoryCluster, MemoryHealthMetrics, KnowledgeCategory } from './types';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your'
]);

export class MemoryConsolidator {
  private similarityThreshold: number;
  private decayHalfLifeDays: number;

  constructor(options?: { similarityThreshold?: number; decayHalfLifeDays?: number }) {
    this.similarityThreshold = options?.similarityThreshold ?? 0.35;
    this.decayHalfLifeDays = options?.decayHalfLifeDays ?? 14;
  }

  /**
   * Tokenizes text into normalized, stop-word-filtered alphanumeric tokens.
   */
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1 && !STOP_WORDS.has(token));
  }

  /**
   * Generates character and word n-grams for richer fuzzy overlap.
   */
  extractKeywords(text: string, maxKeywords: number = 6): string[] {
    const tokens = this.tokenize(text);
    const frequency = new Map<string, number>();
    for (const t of tokens) {
      frequency.set(t, (frequency.get(t) || 0) + 1);
    }
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([k]) => k);
  }

  /**
   * Computes Jaccard similarity coefficient between two sets of tokens.
   */
  computeTokenSimilarity(tokensA: string[], tokensB: string[]): number {
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    let intersectionCount = 0;
    for (const token of setA) {
      if (setB.has(token)) intersectionCount++;
    }

    const unionCount = setA.size + setB.size - intersectionCount;
    if (unionCount === 0) return 0;

    const jaccard = intersectionCount / unionCount;

    // Substring containment bonus
    const strA = tokensA.join(' ');
    const strB = tokensB.join(' ');
    const containmentBonus = (strA.includes(strB) || strB.includes(strA)) ? 0.2 : 0;

    return Math.min(1.0, jaccard + containmentBonus);
  }

  /**
   * Calculates similarity between two memory contents.
   */
  calculateSimilarity(contentA: string, contentB: string): number {
    const tokensA = this.tokenize(contentA);
    const tokensB = this.tokenize(contentB);
    return this.computeTokenSimilarity(tokensA, tokensB);
  }

  /**
   * Clusters a list of memories into thematic groups based on lexical similarity.
   */
  clusterMemories(memories: MemoryRecord[]): MemoryCluster[] {
    if (memories.length === 0) return [];

    const clusters: MemoryCluster[] = [];
    const memoryTokens = new Map<string, string[]>();

    // Pre-tokenize all memories
    for (const m of memories) {
      memoryTokens.set(m.id, this.tokenize(m.content));
    }

    // Single-pass greedy agglomerative clustering
    for (const memory of memories) {
      const tokens = memoryTokens.get(memory.id) || [];
      let bestCluster: MemoryCluster | null = null;
      let highestSimilarity = 0;

      for (const cluster of clusters) {
        // Compare with cluster representative (primary content)
        const clusterTokens = this.tokenize(cluster.primaryContent);
        const sim = this.computeTokenSimilarity(tokens, clusterTokens);

        if (sim >= this.similarityThreshold && sim > highestSimilarity) {
          highestSimilarity = sim;
          bestCluster = cluster;
        }
      }

      if (bestCluster) {
        bestCluster.memoryIds.push(memory.id);
        bestCluster.size = bestCluster.memoryIds.length;
        // Merge keywords
        const newKeywords = this.extractKeywords(memory.content);
        bestCluster.keywords = Array.from(new Set([...bestCluster.keywords, ...newKeywords])).slice(0, 8);
        bestCluster.confidence = Math.max(bestCluster.confidence, Number(highestSimilarity.toFixed(3)));
      } else {
        // Form a new cluster
        const keywords = this.extractKeywords(memory.content);
        const topic = keywords.slice(0, 3).join(' ') || 'General Knowledge';

        clusters.push({
          id: uuidv4(),
          topic: this.formatTopicName(topic),
          category: this.inferCategory(memory.content),
          confidence: 1.0,
          memoryIds: [memory.id],
          primaryContent: memory.content,
          keywords,
          size: 1,
        });
      }
    }

    return clusters;
  }

  /**
   * Format human-readable topic title from keywords.
   */
  private formatTopicName(raw: string): string {
    if (!raw.trim()) return 'General Knowledge';
    return raw
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Heuristically infers the knowledge category of a content string.
   */
  inferCategory(content: string): KnowledgeCategory {
    const text = content.toLowerCase();

    if (
      text.includes('framework') ||
      text.includes('architecture') ||
      text.includes('database') ||
      text.includes('api') ||
      text.includes('docker') ||
      text.includes('microservice') ||
      text.includes('system design')
    ) {
      return 'architecture';
    }

    if (
      text.includes('typescript') ||
      text.includes('python') ||
      text.includes('react') ||
      text.includes('next.js') ||
      text.includes('ollama') ||
      text.includes('qdrant') ||
      text.includes('sqlite') ||
      text.includes('mcp') ||
      text.includes('express')
    ) {
      return 'tech_stack';
    }

    if (
      text.includes('favorite') ||
      text.includes('prefer') ||
      text.includes('my choice') ||
      text.includes('i like') ||
      text.includes('i love') ||
      text.includes('theme') ||
      text.includes('dark mode')
    ) {
      return 'preference';
    }

    if (
      text.includes('todo') ||
      text.includes('task') ||
      text.includes('implement') ||
      text.includes('fix') ||
      text.includes('deadline') ||
      text.includes('deploy') ||
      text.includes('release')
    ) {
      return 'task';
    }

    if (
      text.includes('document') ||
      text.includes('research') ||
      text.includes('algorithm') ||
      text.includes('protocol') ||
      text.includes('standard')
    ) {
      return 'domain_knowledge';
    }

    return 'general';
  }

  /**
   * Calculates retention score based on exponential time decay and access reinforcement.
   */
  calculateMemoryDecayScore(memory: MemoryRecord, now: Date = new Date()): number {
    const lastAccessTime = memory.lastAccessedAt ? new Date(memory.lastAccessedAt).getTime() : new Date(memory.createdAt).getTime();
    const ageDays = Math.max(0, (now.getTime() - lastAccessTime) / (1000 * 60 * 60 * 24));

    // Exponential decay factor: e^(-lambda * t) where halfLife = ln(2) / lambda
    const lambda = Math.LN2 / this.decayHalfLifeDays;
    const decayFactor = Math.exp(-lambda * ageDays);

    // Retrieval reinforcement bonus
    const accesses = memory.retrievalCount ?? 0;
    const reinforcementFactor = 1.0 + 0.35 * Math.log2(1 + accesses);

    const rawScore = 100 * decayFactor * reinforcementFactor;
    return Number(Math.min(100, Math.max(5, rawScore)).toFixed(1));
  }

  /**
   * Computes comprehensive health diagnostics for the memory workspace.
   */
  computeHealthMetrics(memories: MemoryRecord[], clusters: MemoryCluster[]): MemoryHealthMetrics {
    const totalMemories = memories.length;
    if (totalMemories === 0) {
      return {
        totalMemories: 0,
        consolidatedRatio: 0,
        avgAccessCount: 0,
        staleMemoryCount: 0,
        recencyScore: 100,
        topThematicDomains: [],
        consolidationStatus: 'sparse',
      };
    }

    const now = new Date();
    let totalAccesses = 0;
    let staleCount = 0;
    let totalScore = 0;

    for (const m of memories) {
      totalAccesses += m.retrievalCount ?? 0;
      const score = this.calculateMemoryDecayScore(m, now);
      totalScore += score;
      if (score < 30) staleCount++;
    }

    // Memories in multi-item clusters
    const clusteredMemoryCount = clusters
      .filter(c => c.size > 1)
      .reduce((acc, c) => acc + c.size, 0);

    const consolidatedRatio = Number((clusteredMemoryCount / totalMemories).toFixed(2));
    const avgAccessCount = Number((totalAccesses / totalMemories).toFixed(2));
    const recencyScore = Number((totalScore / totalMemories).toFixed(1));

    // Count categories
    const themeCounts = new Map<string, number>();
    for (const c of clusters) {
      themeCounts.set(c.category, (themeCounts.get(c.category) || 0) + c.size);
    }
    const topThematicDomains = Array.from(themeCounts.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count);

    let consolidationStatus: 'optimal' | 'needs_consolidation' | 'sparse' = 'optimal';
    if (totalMemories < 3) {
      consolidationStatus = 'sparse';
    } else if (consolidatedRatio < 0.25 && totalMemories > 8) {
      consolidationStatus = 'needs_consolidation';
    }

    return {
      totalMemories,
      consolidatedRatio,
      avgAccessCount,
      staleMemoryCount: staleCount,
      recencyScore,
      topThematicDomains,
      consolidationStatus,
    };
  }
}
