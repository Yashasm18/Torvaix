import { randomUUID } from 'crypto';
import { db, DEFAULT_GRAPH_WORKSPACE } from './graph-store';
import { slugify } from './slug';
import type { MLIntelligencePayload } from './types';

export type { MLIntelligencePayload };

/** Importance of a node when the source doesn't score it (same as the column default). */
const DEFAULT_IMPORTANCE = 5;


/**
 * Adds entities and relationships to a workspace's graph.
 *
 * By default an edge that already exists is reinforced (frequency + 1, confidence nudged up),
 * because the same fact was mentioned again. Pass `reinforce: false` for derived data that is
 * recomputed from scratch, such as the scheduled graph indexer: re-running it on unchanged
 * memories must leave the graph as it was.
 */
export function ingestKnowledgeGraph(
  payload: MLIntelligencePayload,
  workspaceId: string = DEFAULT_GRAPH_WORKSPACE,
  options: { reinforce?: boolean } = {}
) {
  const reinforce = options.reinforce ?? true;
  const affectedNodeIds = new Set<string>();
  // Payloads without a score (e.g. links from the graph indexer) used to write NULL here, which
  // also erased the score of any existing node they touched (SQLite's MAX(x, NULL) is NULL).
  const importance = typeof payload.importance === 'number' && Number.isFinite(payload.importance)
    ? payload.importance
    : DEFAULT_IMPORTANCE;

  // Transaction for atomic safety
  const transaction = db.transaction(() => {
    const insertNode = db.prepare(`
      INSERT INTO nodes (id, workspaceId, name, type, importance, metadata)
      VALUES (@id, @workspaceId, @name, @type, @importance, @metadata)
      ON CONFLICT(workspaceId, id) DO UPDATE SET
        importance = MAX(importance, excluded.importance),
        type = CASE
          WHEN excluded.type = 'UNKNOWN' THEN nodes.type
          ELSE excluded.type
        END
    `);

    // 1. Insert all explicitly extracted entities
    for (const ent of payload.entities || []) {
      if (typeof ent?.text !== 'string') continue;
      const nodeId = slugify(ent.text);
      if (!nodeId) continue;
      affectedNodeIds.add(nodeId);

      insertNode.run({
        id: nodeId,
        workspaceId,
        name: ent.text,
        type: typeof ent.type === 'string' && ent.type ? ent.type.toUpperCase() : 'UNKNOWN',
        importance,
        metadata: JSON.stringify({ source_category: payload.category, tags: payload.tags })
      });
    }

    const insertEdge = db.prepare(`
      INSERT INTO edges (id, workspaceId, source_id, relation, target_id, confidence, frequency)
      VALUES (@id, @workspaceId, @source_id, @relation, @target_id, @confidence, 1)
      ON CONFLICT(workspaceId, source_id, relation, target_id) DO UPDATE SET
        ${reinforce
          ? 'frequency = edges.frequency + 1, confidence = MIN(1.0, MAX(edges.confidence, excluded.confidence) + 0.05)'
          : 'confidence = MAX(edges.confidence, excluded.confidence)'}
    `);

    // 2. Insert relationships
    for (const rel of payload.relationships || []) {
      if (typeof rel?.source !== 'string' || typeof rel.target !== 'string' || typeof rel.relation !== 'string') continue;
      const sourceId = slugify(rel.source);
      const targetId = slugify(rel.target);
      if (!sourceId || !targetId) continue;

      affectedNodeIds.add(sourceId);
      affectedNodeIds.add(targetId);

      insertNode.run({
        id: sourceId,
        workspaceId,
        name: rel.source,
        type: 'UNKNOWN',
        importance,
        metadata: JSON.stringify({ inferred: true })
      });

      insertNode.run({
        id: targetId,
        workspaceId,
        name: rel.target,
        type: 'UNKNOWN',
        importance,
        metadata: JSON.stringify({ inferred: true })
      });

      const edgeId = randomUUID();
      insertEdge.run({
        id: edgeId,
        workspaceId,
        source_id: sourceId,
        relation: rel.relation.toUpperCase().replace(/\s+/g, '_'),
        target_id: targetId,
        confidence: rel.confidence ?? 0.9
      });
    }

    // 3. Recalculate degree centrality for affected nodes (within this workspace)
    const updateDegree = db.prepare(`
      UPDATE nodes
      SET degree = (
        SELECT COUNT(*) FROM edges
        WHERE edges.workspaceId = nodes.workspaceId
          AND (edges.source_id = nodes.id OR edges.target_id = nodes.id)
      )
      WHERE workspaceId = ? AND id = ?
    `);

    for (const nodeId of affectedNodeIds) {
      updateDegree.run(workspaceId, nodeId);
    }
  });

  transaction();
}
