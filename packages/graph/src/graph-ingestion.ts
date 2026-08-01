import { v4 as uuidv4 } from 'uuid';
import { db } from './graph-store';
import type { MLIntelligencePayload } from './types';

export type { MLIntelligencePayload };

/**
 * Slugs a string to be used as a deterministic node ID.
 * E.g. "React 19" -> "react-19"
 */
function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function ingestKnowledgeGraph(payload: MLIntelligencePayload) {
  const affectedNodeIds = new Set<string>();

  // Transaction for atomic safety
  const transaction = db.transaction(() => {
    const insertNode = db.prepare(`
      INSERT INTO nodes (id, name, type, importance, metadata)
      VALUES (@id, @name, @type, @importance, @metadata)
      ON CONFLICT(id) DO UPDATE SET
        importance = MAX(importance, excluded.importance),
        type = CASE
          WHEN excluded.type = 'UNKNOWN' THEN nodes.type
          ELSE excluded.type
        END
    `);

    // 1. Insert all explicitly extracted entities
    for (const ent of payload.entities) {
      const nodeId = slugify(ent.text);
      if (!nodeId) continue;
      affectedNodeIds.add(nodeId);

      insertNode.run({
        id: nodeId,
        name: ent.text,
        type: ent.type.toUpperCase(),
        importance: payload.importance,
        metadata: JSON.stringify({ source_category: payload.category, tags: payload.tags })
      });
    }

    const insertEdge = db.prepare(`
      INSERT INTO edges (id, source_id, relation, target_id, confidence, frequency)
      VALUES (@id, @source_id, @relation, @target_id, @confidence, 1)
      ON CONFLICT(source_id, relation, target_id) DO UPDATE SET
        frequency = edges.frequency + 1,
        confidence = MIN(1.0, MAX(edges.confidence, excluded.confidence) + 0.05)
    `);

    // 2. Insert relationships
    for (const rel of payload.relationships) {
      const sourceId = slugify(rel.source);
      const targetId = slugify(rel.target);
      if (!sourceId || !targetId) continue;

      affectedNodeIds.add(sourceId);
      affectedNodeIds.add(targetId);

      insertNode.run({
        id: sourceId,
        name: rel.source,
        type: 'UNKNOWN',
        importance: payload.importance,
        metadata: JSON.stringify({ inferred: true })
      });

      insertNode.run({
        id: targetId,
        name: rel.target,
        type: 'UNKNOWN',
        importance: payload.importance,
        metadata: JSON.stringify({ inferred: true })
      });

      const edgeId = uuidv4();
      insertEdge.run({
        id: edgeId,
        source_id: sourceId,
        relation: rel.relation.toUpperCase().replace(/\s+/g, '_'),
        target_id: targetId,
        confidence: rel.confidence ?? 0.9
      });
    }

    // 3. Recalculate degree centrality for affected nodes
    const updateDegree = db.prepare(`
      UPDATE nodes 
      SET degree = (
        SELECT COUNT(*) FROM edges WHERE source_id = nodes.id OR target_id = nodes.id
      )
      WHERE id = ?
    `);

    for (const nodeId of affectedNodeIds) {
      updateDegree.run(nodeId);
    }
  });

  transaction();
}
