/**
 * Qdrant/Ollama availability is re-checked, memories saved while Qdrant was down are indexed
 * once it is reachable, and vectors from different embedding models are never mixed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface Point { id: string; vector: number[]; payload: Record<string, unknown> }

const qdrant = {
  up: false,
  collections: new Map<string, { size: number; points: Map<string, Point> }>(),
};

function assertUp() {
  if (!qdrant.up) throw new Error('connect ECONNREFUSED');
}

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    async getCollections() {
      assertUp();
      return { collections: [...qdrant.collections.keys()].map(name => ({ name })) };
    }
    async getCollection(name: string) {
      assertUp();
      return { config: { params: { vectors: { size: qdrant.collections.get(name)!.size, distance: 'Cosine' } } } };
    }
    async createCollection(name: string, { vectors }: { vectors: { size: number } }) {
      assertUp();
      qdrant.collections.set(name, { size: vectors.size, points: new Map() });
    }
    async upsert(name: string, { points }: { points: Point[] }) {
      assertUp();
      const c = qdrant.collections.get(name)!;
      for (const p of points) {
        if (p.vector.length !== c.size) throw new Error('Wrong input: Vector dimension error');
        c.points.set(p.id, p);
      }
    }
    async retrieve(name: string, { ids }: { ids: string[] }) {
      assertUp();
      const c = qdrant.collections.get(name)!;
      return ids.filter(id => c.points.has(id)).map(id => ({ id, payload: c.points.get(id)!.payload }));
    }
    async delete(name: string, { points }: { points: string[] }) {
      assertUp();
      for (const id of points) qdrant.collections.get(name)!.points.delete(id);
    }
    async search(name: string, { vector, limit, filter }: { vector: number[]; limit: number; filter: { must: { key: string; match: { value: unknown } }[] } }) {
      assertUp();
      return [...qdrant.collections.get(name)!.points.values()]
        .filter(p => filter.must.every(m => p.payload[m.key] === m.match.value))
        .map(p => ({ id: p.id, payload: p.payload, score: p.vector.reduce((s, v, i) => s + v * vector[i], 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }
  },
}));

import { MemoryStore } from '../index';

const DIMS = 8;
let ollamaUp = false;

/** Toy embedding: one dimension per topic word, so similar texts share dimensions. */
function embed(text: string): number[] {
  const topics = ['svelte', 'react', 'python', 'rust', 'coffee', 'tea', 'paris', 'tokyo'];
  const lower = text.toLowerCase();
  const v = topics.map(t => (lower.includes(t) ? 1 : 0));
  return v.some(Boolean) ? v : v.map((_, i) => (i === 0 ? 0.01 : 0));
}

let now = 1_000_000;

beforeEach(() => {
  qdrant.up = false;
  qdrant.collections.clear();
  ollamaUp = false;
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    if (!ollamaUp) throw new Error('connect ECONNREFUSED');
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [] }));
    if (url.endsWith('/api/embeddings')) {
      const { prompt } = JSON.parse(init!.body!);
      return new Response(JSON.stringify({ embedding: embed(prompt) }));
    }
    return new Response('not found', { status: 404 });
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const later = () => { now += 31_000; };

describe('vector search recovery', () => {
  it('picks up Qdrant and Ollama started after the agent, and indexes earlier memories', async () => {
    const store = new MemoryStore(':memory:');
    await store.storeMemory('default', 'My favourite framework is Svelte', 'test');
    expect(await store.initQdrant()).toBe(false);

    qdrant.up = true;
    ollamaUp = true;
    expect(await store.initQdrant()).toBe(false); // still within the re-check window

    later();
    expect(await store.initQdrant()).toBe(true);
    expect(await store.backfillVectors()).toBe(1); // joins the backfill started on reconnect
    expect(await store.backfillVectors()).toBe(0); // nothing left to index

    const points = [...qdrant.collections.get('torvaix_memories')!.points.values()];
    expect(points).toHaveLength(1);
    expect(points[0].payload).toMatchObject({ workspaceId: 'default', embedModel: 'ollama:nomic-embed-text' });

    const results = await store.queryMemory('default', 'svelte', 3);
    expect(results[0].content).toBe('My favourite framework is Svelte');
    expect(['vector', 'hybrid_rrf']).toContain(results[0].retrievalType);
  });

  it('notices when Qdrant goes away and comes back', async () => {
    qdrant.up = true;
    ollamaUp = true;
    const store = new MemoryStore(':memory:');
    expect(await store.initQdrant()).toBe(true);

    qdrant.up = false;
    later();
    expect(await store.initQdrant()).toBe(false);
    await store.storeMemory('default', 'Tea over coffee', 'test'); // SQLite only

    qdrant.up = true;
    later();
    expect(await store.initQdrant()).toBe(true);
    await store.backfillVectors();
    expect(qdrant.collections.get('torvaix_memories')!.points.size).toBe(1);
  });

  it('never stores local hash vectors in Qdrant', async () => {
    qdrant.up = true; // Qdrant up, no embedding model
    const store = new MemoryStore(':memory:');
    await store.storeMemory('default', 'Rust is fast', 'test');
    expect(qdrant.collections.size).toBe(0);

    const results = await store.queryMemory('default', 'rust', 3);
    expect(results[0]).toMatchObject({ content: 'Rust is fast', retrievalType: 'keyword' });
  });

  it('skips vectors of the wrong size instead of failing every write', async () => {
    qdrant.up = true;
    ollamaUp = true;
    qdrant.collections.set('torvaix_memories', { size: 1536, points: new Map() }); // made with another model
    const store = new MemoryStore(':memory:');

    const id = await store.storeMemory('default', 'Paris in spring', 'test');
    expect(await store.getMemoryById(id)).toBeTruthy();
    expect(qdrant.collections.get('torvaix_memories')!.points.size).toBe(0);
    expect((await store.queryMemory('default', 'paris', 3))[0].content).toBe('Paris in spring');
  });

  it('only compares vectors from the same embedding model', async () => {
    qdrant.up = true;
    ollamaUp = true;
    qdrant.collections.set('torvaix_memories', { size: DIMS, points: new Map() });
    // A vector left by an older version (no embedModel tag) must not be returned.
    qdrant.collections.get('torvaix_memories')!.points.set('legacy', { id: 'legacy', vector: embed('tokyo'), payload: { workspaceId: 'default' } });

    const store = new MemoryStore(':memory:');
    await store.storeMemory('default', 'Tokyo trip notes', 'test');
    const results = await store.queryMemory('default', 'tokyo', 5);
    expect(results.map(r => r.id)).not.toContain('legacy');
    expect(results[0].content).toBe('Tokyo trip notes');
  });

  it('drops the old vector when an edit cannot be re-embedded', async () => {
    qdrant.up = true;
    ollamaUp = true;
    const store = new MemoryStore(':memory:');
    const id = await store.storeMemory('default', 'Python tips', 'test');
    expect(qdrant.collections.get('torvaix_memories')!.points.has(id)).toBe(true);

    ollamaUp = false;
    later();
    await store.updateMemory(id, 'Coffee brewing notes');
    expect(qdrant.collections.get('torvaix_memories')!.points.has(id)).toBe(false);
  });
});
