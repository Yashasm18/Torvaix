import { describe, it, expect, beforeEach } from 'vitest';
import {
  ingestKnowledgeGraph,
  getNeighbors,
  findPath,
  queryGraph,
  queryGraphFiltered,
  getEgoGraph,
  getGraphStats,
  getAllNodesAndEdges,
  db,
} from '../index';
import type { MLIntelligencePayload } from '../types';

describe('@torvaix/graph — Production Enterprise Knowledge Graph Engine', () => {
  beforeEach(() => {
    db.exec('DELETE FROM edges');
    db.exec('DELETE FROM nodes');
  });

  it('ingests entities and relationships accurately', () => {
    const payload: MLIntelligencePayload = {
      category: 'Technical',
      importance: 9.0,
      entities: [
        { text: 'Torvaix OS', type: 'PROJECT' },
        { text: 'SQLite', type: 'TECHNOLOGY' },
      ],
      tags: ['database', 'storage'],
      relationships: [
        { source: 'Torvaix OS', relation: 'PERSISTS_TO', target: 'SQLite', confidence: 0.95 },
      ],
    };

    ingestKnowledgeGraph(payload);

    const all = getAllNodesAndEdges();
    expect(all.nodes.length).toBe(2);
    expect(all.edges.length).toBe(1);

    const neighbors = getNeighbors('Torvaix OS');
    expect(neighbors.length).toBe(1);
    expect(neighbors[0].node.name).toBe('SQLite');
    expect(neighbors[0].relation).toBe('PERSISTS_TO');
  });

  it('reinforces edge frequency and confidence on repeated ingestion', () => {
    const payload1: MLIntelligencePayload = {
      category: 'Technical',
      importance: 7.0,
      entities: [
        { text: 'Torvaix', type: 'PROJECT' },
        { text: 'Qdrant', type: 'TECHNOLOGY' },
      ],
      tags: ['vector'],
      relationships: [
        { source: 'Torvaix', relation: 'USES', target: 'Qdrant', confidence: 0.8 },
      ],
    };

    const payload2: MLIntelligencePayload = {
      category: 'Technical',
      importance: 8.5,
      entities: [
        { text: 'Torvaix', type: 'PROJECT' },
        { text: 'Qdrant', type: 'TECHNOLOGY' },
      ],
      tags: ['vector'],
      relationships: [
        { source: 'Torvaix', relation: 'USES', target: 'Qdrant', confidence: 0.9 },
      ],
    };

    ingestKnowledgeGraph(payload1);
    ingestKnowledgeGraph(payload2);

    const all = getAllNodesAndEdges();
    expect(all.edges.length).toBe(1);
    expect(all.edges[0].frequency).toBe(2);
    expect(all.edges[0].confidence).toBeGreaterThan(0.9);
  });

  it('computes node degree centrality dynamically', () => {
    const payload: MLIntelligencePayload = {
      category: 'Technical',
      importance: 9.0,
      entities: [
        { text: 'Torvaix Hub', type: 'PROJECT' },
        { text: 'Ollama', type: 'LLM' },
        { text: 'Qdrant', type: 'VECTOR_DB' },
        { text: 'FastAPI', type: 'BACKEND' },
      ],
      tags: ['architecture'],
      relationships: [
        { source: 'Torvaix Hub', relation: 'USES', target: 'Ollama', confidence: 0.9 },
        { source: 'Torvaix Hub', relation: 'USES', target: 'Qdrant', confidence: 0.9 },
        { source: 'Torvaix Hub', relation: 'USES', target: 'FastAPI', confidence: 0.9 },
      ],
    };

    ingestKnowledgeGraph(payload);

    const hubNode = db.prepare(`SELECT * FROM nodes WHERE name = 'Torvaix Hub'`).get() as any;
    expect(hubNode.degree).toBe(3);
  });

  it('extracts N-hop ego graph sub-graph around a central node', () => {
    ingestKnowledgeGraph({
      category: 'Tech',
      importance: 8.0,
      entities: [
        { text: 'A', type: 'NODE' },
        { text: 'B', type: 'NODE' },
      ],
      tags: [],
      relationships: [{ source: 'A', relation: 'LINKS', target: 'B', confidence: 0.9 }],
    });

    ingestKnowledgeGraph({
      category: 'Tech',
      importance: 8.0,
      entities: [
        { text: 'B', type: 'NODE' },
        { text: 'C', type: 'NODE' },
      ],
      tags: [],
      relationships: [{ source: 'B', relation: 'LINKS', target: 'C', confidence: 0.9 }],
    });

    const ego = getEgoGraph('A', 2, 50);
    expect(ego).not.toBeNull();
    expect(ego!.center.name).toBe('A');
    expect(ego!.nodes.map((n) => n.name)).toContain('A');
    expect(ego!.nodes.map((n) => n.name)).toContain('B');
    expect(ego!.nodes.map((n) => n.name)).toContain('C');
    expect(ego!.edges.length).toBe(2);
  });

  it('filters nodes with pagination via queryGraphFiltered', () => {
    ingestKnowledgeGraph({
      category: 'Tech',
      importance: 9.0,
      entities: [
        { text: 'React 19', type: 'FRAMEWORK' },
        { text: 'Vue 3', type: 'FRAMEWORK' },
        { text: 'SQLite', type: 'DATABASE' },
      ],
      tags: [],
      relationships: [],
    });

    const frameworksOnly = queryGraphFiltered({ type: 'FRAMEWORK' });
    expect(frameworksOnly.total).toBe(2);
    expect(frameworksOnly.nodes.map((n) => n.name)).toEqual(
      expect.arrayContaining(['React 19', 'Vue 3'])
    );

    const searchResult = queryGraphFiltered({ search: 'React', limit: 10 });
    expect(searchResult.total).toBe(1);
    expect(searchResult.nodes[0].name).toBe('React 19');
  });

  it('calculates enterprise graph stats', () => {
    ingestKnowledgeGraph({
      category: 'Tech',
      importance: 9.0,
      entities: [
        { text: 'Node X', type: 'SERVICE' },
        { text: 'Node Y', type: 'SERVICE' },
      ],
      tags: [],
      relationships: [{ source: 'Node X', relation: 'CALLS', target: 'Node Y', confidence: 0.9 }],
    });

    const stats = getGraphStats();
    expect(stats.totalNodes).toBeGreaterThanOrEqual(2);
    expect(stats.totalEdges).toBeGreaterThanOrEqual(1);
    expect(stats.entityTypeCounts['SERVICE']).toBeGreaterThanOrEqual(2);
  });

  it('finds path between connected nodes across multi-hop relationships', () => {
    const payload1: MLIntelligencePayload = {
      category: 'Technical',
      importance: 8.5,
      entities: [
        { text: 'User', type: 'PERSON' },
        { text: 'Torvaix', type: 'PROJECT' },
      ],
      tags: ['identity'],
      relationships: [
        { source: 'User', relation: 'USES', target: 'Torvaix', confidence: 0.98 },
      ],
    };

    const payload2: MLIntelligencePayload = {
      category: 'Technical',
      importance: 8.5,
      entities: [
        { text: 'Torvaix', type: 'PROJECT' },
        { text: 'Qdrant', type: 'TECHNOLOGY' },
      ],
      tags: ['vector'],
      relationships: [
        { source: 'Torvaix', relation: 'INDEXES_WITH', target: 'Qdrant', confidence: 0.92 },
      ],
    };

    ingestKnowledgeGraph(payload1);
    ingestKnowledgeGraph(payload2);

    const path = findPath('User', 'Qdrant');
    expect(path).not.toBeNull();
    expect(path!.map((n) => n.name)).toEqual(['User', 'Torvaix', 'Qdrant']);
  });
});
