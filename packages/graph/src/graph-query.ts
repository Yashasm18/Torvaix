import { db } from './graph-store';
import type { GraphNode, GraphEdge, EgoGraphResult, QueryGraphOptions, GraphStats } from './types';

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function getNeighbors(entityName: string): { node: GraphNode; relation: string; direction: 'OUT' | 'IN' }[] {
  const nodeId = slugify(entityName);

  const outEdges = db.prepare(`
    SELECT e.relation, n.* 
    FROM edges e 
    JOIN nodes n ON e.target_id = n.id 
    WHERE e.source_id = ?
  `).all(nodeId) as any[];

  const inEdges = db.prepare(`
    SELECT e.relation, n.* 
    FROM edges e 
    JOIN nodes n ON e.source_id = n.id 
    WHERE e.target_id = ?
  `).all(nodeId) as any[];

  return [
    ...outEdges.map(r => ({
      node: { id: r.id, name: r.name, type: r.type, importance: r.importance, degree: r.degree, metadata: r.metadata, created_at: r.created_at },
      relation: r.relation,
      direction: 'OUT' as const
    })),
    ...inEdges.map(r => ({
      node: { id: r.id, name: r.name, type: r.type, importance: r.importance, degree: r.degree, metadata: r.metadata, created_at: r.created_at },
      relation: r.relation,
      direction: 'IN' as const
    }))
  ];
}

export function findEntitiesByType(type: string): GraphNode[] {
  return db.prepare(`
    SELECT * FROM nodes WHERE type = ? ORDER BY importance DESC, degree DESC
  `).all(type.toUpperCase()) as GraphNode[];
}

export function queryGraph(query: string): GraphNode[] {
  const term = `%${query}%`;
  return db.prepare(`
    SELECT * FROM nodes 
    WHERE name LIKE ? OR type LIKE ? OR metadata LIKE ?
    ORDER BY importance DESC, degree DESC
    LIMIT 20
  `).all(term, term, term) as GraphNode[];
}

export function queryGraphFiltered(options: QueryGraphOptions = {}): { nodes: GraphNode[]; total: number } {
  const { search, type, minImportance, limit = 50, offset = 0 } = options;

  let whereClauses: string[] = [];
  let params: any[] = [];

  if (search && search.trim().length > 0) {
    whereClauses.push('(name LIKE ? OR type LIKE ? OR metadata LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  if (type && type.trim().length > 0) {
    whereClauses.push('type = ?');
    params.push(type.trim().toUpperCase());
  }

  if (typeof minImportance === 'number') {
    whereClauses.push('importance >= ?');
    params.push(minImportance);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM nodes ${whereSql}`).get(...params) as { total: number };
  
  const nodes = db.prepare(`
    SELECT * FROM nodes 
    ${whereSql}
    ORDER BY importance DESC, degree DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as GraphNode[];

  return { nodes, total: countRow.total };
}

export function getEgoGraph(entityName: string, depth = 2, maxNodes = 50): EgoGraphResult | null {
  const centerId = slugify(entityName);
  const centerNode = db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(centerId) as GraphNode | undefined;
  if (!centerNode) return null;

  const visitedNodeIds = new Set<string>([centerId]);
  const collectedEdgeIds = new Set<string>();

  let currentFrontier = [centerId];

  for (let d = 0; d < depth; d++) {
    if (currentFrontier.length === 0 || visitedNodeIds.size >= maxNodes) break;
    const nextFrontier: string[] = [];

    for (const nodeId of currentFrontier) {
      const edges = db.prepare(`
        SELECT * FROM edges WHERE source_id = ? OR target_id = ?
      `).all(nodeId, nodeId) as GraphEdge[];

      for (const edge of edges) {
        collectedEdgeIds.add(edge.id);
        const neighborId = edge.source_id === nodeId ? edge.target_id : edge.source_id;

        if (!visitedNodeIds.has(neighborId)) {
          visitedNodeIds.add(neighborId);
          nextFrontier.push(neighborId);
          if (visitedNodeIds.size >= maxNodes) break;
        }
      }

      if (visitedNodeIds.size >= maxNodes) break;
    }

    currentFrontier = nextFrontier;
  }

  const placeholders = Array.from(visitedNodeIds).map(() => '?').join(',');
  const nodes = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders}) ORDER BY importance DESC`).all(...Array.from(visitedNodeIds)) as GraphNode[];

  const edgeList = collectedEdgeIds.size > 0
    ? (db.prepare(`SELECT * FROM edges WHERE id IN (${Array.from(collectedEdgeIds).map(() => '?').join(',')})`).all(...Array.from(collectedEdgeIds)) as GraphEdge[])
    : [];

  return {
    center: centerNode,
    nodes,
    edges: edgeList,
    depth,
  };
}

export function getGraphStats(): GraphStats {
  const totalNodesRow = db.prepare(`SELECT COUNT(*) as cnt FROM nodes`).get() as { cnt: number };
  const totalEdgesRow = db.prepare(`SELECT COUNT(*) as cnt FROM edges`).get() as { cnt: number };

  const typeRows = db.prepare(`
    SELECT type, COUNT(*) as cnt FROM nodes GROUP BY type ORDER BY cnt DESC
  `).all() as { type: string; cnt: number }[];

  const entityTypeCounts: Record<string, number> = {};
  for (const r of typeRows) {
    entityTypeCounts[r.type] = r.cnt;
  }

  const topHubs = db.prepare(`
    SELECT name, type, degree, importance FROM nodes ORDER BY degree DESC, importance DESC LIMIT 5
  `).all() as { name: string; type: string; degree: number; importance: number }[];

  return {
    totalNodes: totalNodesRow.cnt,
    totalEdges: totalEdgesRow.cnt,
    entityTypeCounts,
    topHubs,
  };
}

export function getAllNodesAndEdges() {
  const nodes = db.prepare(`SELECT * FROM nodes ORDER BY importance DESC, degree DESC`).all() as GraphNode[];
  const edges = db.prepare(`SELECT * FROM edges ORDER BY confidence DESC`).all() as GraphEdge[];
  return { nodes, edges };
}

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

    const edges = db.prepare(`
      SELECT target_id as neighbor FROM edges WHERE source_id = ?
      UNION
      SELECT source_id as neighbor FROM edges WHERE target_id = ?
    `).all(current, current) as { neighbor: string }[];

    for (const edge of edges) {
      if (edge.neighbor === endId) {
        const fullPath = [...path, endId];
        return fullPath.map(id => db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(id) as GraphNode);
      }

      if (!visited.has(edge.neighbor)) {
        visited.add(edge.neighbor);
        queue.push([...path, edge.neighbor]);
      }
    }
  }

  return null;
}
