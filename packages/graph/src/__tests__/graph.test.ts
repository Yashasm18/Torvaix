import { describe, it, expect, beforeEach } from 'vitest';
import {
  ingestKnowledgeGraph,
  getNeighbors,
  findPath,
  queryGraph,
  findMentionedEntities,
  slugify,
  queryGraphFiltered,
  getEgoGraph,
  getGraphStats,
  getAllNodesAndEdges,
  findEntitiesByType,
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

describe('@torvaix/graph — workspace isolation', () => {
  beforeEach(() => {
    db.exec('DELETE FROM edges');
    db.exec('DELETE FROM nodes');
  });

  const payload = (entity: string, target: string): MLIntelligencePayload => ({
    category: 'Technical',
    importance: 8,
    entities: [{ text: entity, type: 'PROJECT' }, { text: target, type: 'TECHNOLOGY' }],
    tags: [],
    relationships: [{ source: entity, relation: 'USES', target, confidence: 0.9 }],
  });

  it('keeps each workspace\u2019s entities and relationships separate', () => {
    ingestKnowledgeGraph(payload('Thesis', 'Postgres'), 'ws-a');
    ingestKnowledgeGraph(payload('Side Project', 'Redis'), 'ws-b');

    const a = getAllNodesAndEdges('ws-a');
    const b = getAllNodesAndEdges('ws-b');
    expect(a.nodes.map(n => n.name).sort()).toEqual(['Postgres', 'Thesis']);
    expect(b.nodes.map(n => n.name).sort()).toEqual(['Redis', 'Side Project']);
    expect(a.edges.length).toBe(1);
    expect(b.edges.length).toBe(1);

    // Reads never cross workspaces
    expect(queryGraph('Redis', 'ws-a')).toEqual([]);
    expect(getNeighbors('Thesis', 'ws-b')).toEqual([]);
    expect(getNeighbors('Thesis', 'ws-a').map(n => n.node.name)).toEqual(['Postgres']);
    expect(findEntitiesByType('TECHNOLOGY', 'ws-b').map(n => n.name)).toEqual(['Redis']);
    expect(getEgoGraph('Thesis', 2, 50, 'ws-b')).toBeNull();
    expect(getGraphStats('ws-a').totalNodes).toBe(2);
    expect(queryGraphFiltered({ workspaceId: 'ws-b' }).total).toBe(2);
    expect(findPath('Thesis', 'Postgres', 3, 'ws-b')).toBeNull();
  });

  it('lets the same entity name mean different things in two workspaces', () => {
    ingestKnowledgeGraph(payload('Atlas', 'Postgres'), 'ws-a');
    ingestKnowledgeGraph(payload('Atlas', 'MongoDB'), 'ws-b');

    expect(getNeighbors('Atlas', 'ws-a').map(n => n.node.name)).toEqual(['Postgres']);
    expect(getNeighbors('Atlas', 'ws-b').map(n => n.node.name)).toEqual(['MongoDB']);
    expect(getGraphStats('ws-a').totalNodes).toBe(2);
    expect(getGraphStats('ws-b').totalNodes).toBe(2);
  });

  it('defaults to the default workspace when none is given', () => {
    ingestKnowledgeGraph(payload('Torvaix', 'SQLite'));
    expect(getAllNodesAndEdges().nodes.length).toBe(2);
    expect(getAllNodesAndEdges('ws-a').nodes.length).toBe(0);
  });
});

describe('ingestKnowledgeGraph without reinforcement', () => {
  beforeEach(() => {
    db.exec('DELETE FROM edges');
    db.exec('DELETE FROM nodes');
  });

  it('leaves the graph unchanged when the same derived links are written again', () => {
    const payload: MLIntelligencePayload = { relationships: [{ source: 'Svelte', relation: 'RELATED_TO', target: 'Framework', confidence: 0.6 }] };
    ingestKnowledgeGraph(payload, 'ws-idem', { reinforce: false });
    ingestKnowledgeGraph(payload, 'ws-idem', { reinforce: false });
    ingestKnowledgeGraph(payload, 'ws-idem', { reinforce: false });

    const edges = db.prepare("SELECT frequency, confidence FROM edges WHERE workspaceId = 'ws-idem'").all() as { frequency: number; confidence: number }[];
    expect(edges).toEqual([{ frequency: 1, confidence: 0.6 }]);
  });

  it('still reinforces by default when a fact is mentioned again', () => {
    const payload: MLIntelligencePayload = { relationships: [{ source: 'Svelte', relation: 'RELATED_TO', target: 'Framework', confidence: 0.6 }] };
    ingestKnowledgeGraph(payload, 'ws-reinforce');
    ingestKnowledgeGraph(payload, 'ws-reinforce');
    const edge = db.prepare("SELECT frequency FROM edges WHERE workspaceId = 'ws-reinforce'").get() as { frequency: number };
    expect(edge.frequency).toBe(2);
  });
});

describe('node importance', () => {
  beforeEach(() => {
    db.exec('DELETE FROM edges');
    db.exec('DELETE FROM nodes');
  });

  it('defaults to 5 for links that come without a score', () => {
    // The graph indexer writes relationships only. Their nodes were saved with NULL importance,
    // which crashed the graph view when one was selected.
    ingestKnowledgeGraph({ relationships: [{ source: 'Database', relation: 'RELATED_TO', target: 'Postgres' }] }, 'ws-imp');
    const rows = db.prepare("SELECT importance FROM nodes WHERE workspaceId = 'ws-imp'").all() as { importance: number | null }[];
    expect(rows.map(r => r.importance)).toEqual([5, 5]);
  });

  it('is not erased when a scored entity is mentioned again by an unscored link', () => {
    ingestKnowledgeGraph({ importance: 9, entities: [{ text: 'Postgres', type: 'TECHNOLOGY' }] }, 'ws-imp');
    ingestKnowledgeGraph({ relationships: [{ source: 'Database', relation: 'RELATED_TO', target: 'Postgres' }] }, 'ws-imp');
    const node = db.prepare("SELECT importance, type FROM nodes WHERE workspaceId = 'ws-imp' AND id = 'postgres'").get() as { importance: number; type: string };
    expect(node).toEqual({ importance: 9, type: 'TECHNOLOGY' });
  });

  it('skips malformed entities and relationships instead of failing the whole write', () => {
    const payload = {
      entities: [{ text: 'Redis' }, { type: 'TECHNOLOGY' }, null],
      relationships: [{ source: 'Redis', target: 'Cache' }, { source: 'Redis', relation: 'USED_FOR', target: 'Cache' }],
    } as unknown as MLIntelligencePayload;
    ingestKnowledgeGraph(payload, 'ws-imp');
    expect(getAllNodesAndEdges('ws-imp').nodes.map(n => n.name).sort()).toEqual(['Cache', 'Redis']);
    expect(getAllNodesAndEdges('ws-imp').edges).toHaveLength(1);
  });
});

describe('findMentionedEntities', () => {
  beforeEach(() => {
    db.exec('DELETE FROM edges');
    db.exec('DELETE FROM nodes');
    ingestKnowledgeGraph({
      entities: [{ text: 'Next.js', type: 'TECHNOLOGY' }, { text: 'React 19', type: 'TECHNOLOGY' }, { text: 'Postgres', type: 'TECHNOLOGY' }],
      relationships: [{ source: 'Next.js', relation: 'BUILT_ON', target: 'React 19' }],
    }, 'ws-chat');
  });

  it('finds the entities a chat message names, which a search for the whole message never did', () => {
    const message = 'Should I upgrade to React 19 before moving the app to Next.js?';
    expect(queryGraph(message, 'ws-chat')).toEqual([]);
    expect(findMentionedEntities(message, 'ws-chat').map(n => n.name).sort()).toEqual(['Next.js', 'React 19']);
  });

  it('matches whole words only and stays inside the workspace', () => {
    expect(findMentionedEntities('nextjsx and postgresql are different words', 'ws-chat')).toEqual([]);
    expect(findMentionedEntities('Tell me about Postgres', 'another-workspace')).toEqual([]);
    expect(findMentionedEntities('   ', 'ws-chat')).toEqual([]);
  });
});

describe('entity ids', () => {
  beforeEach(() => {
    db.exec('DELETE FROM edges');
    db.exec('DELETE FROM nodes');
  });

  it('keeps ids of plain names as they were, so existing graphs still match', () => {
    expect(slugify('React 19')).toBe('react-19');
    expect(slugify('Next.js')).toBe('nextjs');
    expect(slugify('Torvaix OS')).toBe('torvaix-os');
  });

  it('gives C++ and C# their own nodes, which used to share the id "c"', () => {
    expect(slugify('C++')).toBe('c-plus-plus');
    expect(slugify('C#')).toBe('c-sharp');
    ingestKnowledgeGraph({ entities: [{ text: 'C++', type: 'TECHNOLOGY' }, { text: 'C#', type: 'TECHNOLOGY' }] }, 'ws-ids');
    expect(getAllNodesAndEdges('ws-ids').nodes.map(n => n.name).sort()).toEqual(['C#', 'C++']);
    expect(findMentionedEntities('Is C++ faster than C#?', 'ws-ids').map(n => n.name).sort()).toEqual(['C#', 'C++']);
  });

  it('keeps names in other scripts and with accents, which used to be dropped or cut', () => {
    ingestKnowledgeGraph({ entities: [{ text: '東京', type: 'PLACE' }, { text: 'Café', type: 'PLACE' }] }, 'ws-ids');
    expect(getAllNodesAndEdges('ws-ids').nodes.map(n => n.id).sort()).toEqual(['café', '東京'].sort());
    expect(slugify('!!!')).toBe('');
  });
});
