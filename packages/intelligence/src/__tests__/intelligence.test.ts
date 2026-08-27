import { describe, it, expect } from 'vitest';
import { MemoryConsolidator, WorkspaceKnowledgeSynthesizer, MemoryRecord } from '../index';

describe('@torvaix/intelligence — MemoryConsolidator', () => {
  const consolidator = new MemoryConsolidator({ similarityThreshold: 0.35 });

  it('tokenizes text and removes stop words', () => {
    const text = 'The user prefers Next.js and TypeScript for modern web development!';
    const tokens = consolidator.tokenize(text);
    expect(tokens).toContain('user');
    expect(tokens).toContain('prefers');
    expect(tokens).toContain('next');
    expect(tokens).toContain('typescript');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('and');
    expect(tokens).not.toContain('for');
  });

  it('extracts top keywords from memory content', () => {
    const text = 'Docker container deployment for Qdrant vector database and Docker compose service.';
    const keywords = consolidator.extractKeywords(text, 3);
    expect(keywords).toContain('docker');
  });

  it('calculates token similarity between related contents', () => {
    const textA = 'My favorite framework is Next.js';
    const textB = 'I prefer using Next.js framework for frontend';
    const textC = 'Python is great for deep learning and neural networks';

    const simAB = consolidator.calculateSimilarity(textA, textB);
    const simAC = consolidator.calculateSimilarity(textA, textC);

    expect(simAB).toBeGreaterThan(0.35);
    expect(simAB).toBeGreaterThan(simAC);
  });

  it('clusters related memories and isolates unrelated ones', () => {
    const sampleMemories: MemoryRecord[] = [
      {
        id: '1',
        workspaceId: 'ws-1',
        source: 'chat',
        content: 'I love React and Next.js for web application design.',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        workspaceId: 'ws-1',
        source: 'chat',
        content: 'Next.js is my primary React web framework.',
        createdAt: new Date().toISOString(),
      },
      {
        id: '3',
        workspaceId: 'ws-1',
        source: 'chat',
        content: 'I use Qdrant for storing vector embeddings in SQLite.',
        createdAt: new Date().toISOString(),
      },
    ];

    const clusters = consolidator.clusterMemories(sampleMemories);
    expect(clusters.length).toBeGreaterThanOrEqual(2);

    // Check that Next.js / React memories grouped together
    const nextCluster = clusters.find(c => c.memoryIds.includes('1') && c.memoryIds.includes('2'));
    expect(nextCluster).toBeDefined();
    expect(nextCluster?.size).toBe(2);
  });

  it('calculates memory decay score with access reinforcement', () => {
    const now = new Date();
    const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const oldDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days ago

    const recentMemory: MemoryRecord = {
      id: 'm1',
      workspaceId: 'default',
      source: 'chat',
      content: 'Recently retrieved architecture fact',
      createdAt: recentDate,
      lastAccessedAt: recentDate,
      retrievalCount: 5,
    };

    const staleMemory: MemoryRecord = {
      id: 'm2',
      workspaceId: 'default',
      source: 'chat',
      content: 'Stale forgotten fact',
      createdAt: oldDate,
      lastAccessedAt: oldDate,
      retrievalCount: 0,
    };

    const recentScore = consolidator.calculateMemoryDecayScore(recentMemory, now);
    const staleScore = consolidator.calculateMemoryDecayScore(staleMemory, now);

    expect(recentScore).toBeGreaterThan(staleScore);
    expect(recentScore).toBeGreaterThan(50);
  });

  it('computes workspace health metrics', () => {
    const memories: MemoryRecord[] = [
      { id: '1', workspaceId: 'w', source: 'chat', content: 'TypeScript preferred', createdAt: new Date().toISOString(), retrievalCount: 3 },
      { id: '2', workspaceId: 'w', source: 'chat', content: 'TypeScript language choice', createdAt: new Date().toISOString(), retrievalCount: 2 },
      { id: '3', workspaceId: 'w', source: 'chat', content: 'SQLite local database', createdAt: new Date().toISOString(), retrievalCount: 1 },
    ];

    const clusters = consolidator.clusterMemories(memories);
    const metrics = consolidator.computeHealthMetrics(memories, clusters);

    expect(metrics.totalMemories).toBe(3);
    expect(metrics.avgAccessCount).toBe(2.0);
    expect(metrics.recencyScore).toBeGreaterThan(0);
    expect(metrics.topThematicDomains.length).toBeGreaterThan(0);
  });
});

describe('@torvaix/intelligence — WorkspaceKnowledgeSynthesizer', () => {
  const synthesizer = new WorkspaceKnowledgeSynthesizer();

  it('runs complete autonomous consolidation and generates synthesis report', () => {
    const memories: MemoryRecord[] = [
      {
        id: 'mem-1',
        workspaceId: 'default',
        source: 'User Chat',
        content: 'System architecture utilizes Next.js 16 and SQLite database.',
        createdAt: new Date().toISOString(),
        retrievalCount: 4,
      },
      {
        id: 'mem-2',
        workspaceId: 'default',
        source: 'User Chat',
        content: 'Next.js architecture handles server and client components.',
        createdAt: new Date().toISOString(),
        retrievalCount: 2,
      },
      {
        id: 'mem-3',
        workspaceId: 'default',
        source: 'User Chat',
        content: 'User prefers dark mode aesthetic with cyan neon accents.',
        createdAt: new Date().toISOString(),
        retrievalCount: 1,
      },
    ];

    const report = synthesizer.consolidateWorkspace('default', memories);

    expect(report.workspaceId).toBe('default');
    expect(report.processedCount).toBe(3);
    expect(report.clustersCount).toBeGreaterThanOrEqual(2);
    expect(report.synthesizedInsights.length).toBeGreaterThanOrEqual(2);

    // Verify insight structure
    const topInsight = report.synthesizedInsights[0];
    expect(topInsight.title).toBeDefined();
    expect(topInsight.summary).toBeDefined();
    expect(topInsight.importance).toBeGreaterThan(0);

    // Verify graph reinforcements generated
    expect(report.graphReinforcements.length).toBeGreaterThan(0);
    const edge = report.graphReinforcements[0];
    expect(edge.sourceEntity).toBeDefined();
    expect(edge.targetEntity).toBeDefined();
    expect(edge.relation).toBeDefined();
    expect(edge.weight).toBeGreaterThan(0);
  });
});
