import { db } from './graph-store';
import { GraphNode, GraphEdge } from './types';

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function getNeighbors(entityName: string): { node: GraphNode, relation: string, direction: 'OUT' | 'IN' }[] {
  const nodeId = slugify(entityName);
  
  // Find outgoing edges
  const outEdges = db.prepare(`
    SELECT e.relation, n.* 
    FROM edges e 
    JOIN nodes n ON e.target_id = n.id 
    WHERE e.source_id = ?
  `).all(nodeId) as any[];

  // Find incoming edges
  const inEdges = db.prepare(`
    SELECT e.relation, n.* 
    FROM edges e 
    JOIN nodes n ON e.source_id = n.id 
    WHERE e.target_id = ?
  `).all(nodeId) as any[];

  return [
    ...outEdges.map(r => ({ node: { id: r.id, name: r.name, type: r.type, importance: r.importance, metadata: r.metadata, created_at: r.created_at }, relation: r.relation, direction: 'OUT' as const })),
    ...inEdges.map(r => ({ node: { id: r.id, name: r.name, type: r.type, importance: r.importance, metadata: r.metadata, created_at: r.created_at }, relation: r.relation, direction: 'IN' as const }))
  ];
}

export function findEntitiesByType(type: string): GraphNode[] {
  return db.prepare(`
    SELECT * FROM nodes WHERE type = ? ORDER BY importance DESC
  `).all(type.toUpperCase()) as GraphNode[];
}

export function queryGraph(query: string): GraphNode[] {
  // A simple fuzzy search for now
  const term = `%${query}%`;
  return db.prepare(`
    SELECT * FROM nodes 
    WHERE name LIKE ? OR type LIKE ? OR metadata LIKE ?
    ORDER BY importance DESC
    LIMIT 20
  `).all(term, term, term) as GraphNode[];
}

export function getAllNodesAndEdges() {
  const nodes = db.prepare(`SELECT * FROM nodes ORDER BY importance DESC`).all() as GraphNode[];
  const edges = db.prepare(`SELECT * FROM edges`).all() as GraphEdge[];
  return { nodes, edges };
}

// Simple breadth-first search pathfinding
export function findPath(entityA: string, entityB: string, maxDepth = 3) {
  const startId = slugify(entityA);
  const endId = slugify(entityB);

  if (startId === endId) return [];

  const queue = [[startId]];
  const visited = new Set([startId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    if (path.length > maxDepth) continue;

    // Get neighbors of current
    const edges = db.prepare(`
      SELECT target_id as neighbor FROM edges WHERE source_id = ?
      UNION
      SELECT source_id as neighbor FROM edges WHERE target_id = ?
    `).all(current, current) as { neighbor: string }[];

    for (const edge of edges) {
      if (edge.neighbor === endId) {
        // Found path, construct node list
        const fullPath = [...path, endId];
        return fullPath.map(id => db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(id) as GraphNode);
      }

      if (!visited.has(edge.neighbor)) {
        visited.add(edge.neighbor);
        queue.push([...path, edge.neighbor]);
      }
    }
  }

  return null; // No path found
}
