import { describe, it, expect, beforeEach } from 'vitest';
import { ingestKnowledgeGraph, getNeighbors, findPath, queryGraph, getAllNodesAndEdges, db } from '../index';
import type { MLIntelligencePayload } from '../types';

describe('@torvaix/graph — Knowledge Graph', () => {
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
        { source: 'Torvaix OS', relation: 'PERSISTS_TO', target: 'SQLite', confidence: 0.99 },
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

  it('queries nodes by name/entity search', () => {
    const payload: MLIntelligencePayload = {
      category: 'Technical',
      importance: 8.0,
      entities: [
        { text: 'Next.js', type: 'FRAMEWORK' },
        { text: 'React', type: 'LIBRARY' },
      ],
      tags: ['frontend'],
      relationships: [
        { source: 'Next.js', relation: 'USES', target: 'React', confidence: 0.95 },
      ],
    };

    ingestKnowledgeGraph(payload);

    const results = queryGraph('Next.js');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Next.js');
    expect(results[0].type).toBe('FRAMEWORK');
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
