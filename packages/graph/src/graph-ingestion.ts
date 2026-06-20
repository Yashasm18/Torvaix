import { v4 as uuidv4 } from 'uuid';
import { db } from './graph-store';

export interface MLIntelligencePayload {
  category: string;
  importance: number;
  entities: { text: string; type: string }[];
  tags: string[];
  relationships: { source: string; relation: string; target: string; confidence?: number }[];
}

/**
 * Slugs a string to be used as a deterministic node ID.
 * E.g. "React 19" -> "react-19"
 */
function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function ingestKnowledgeGraph(payload: MLIntelligencePayload) {
  // We use a transaction for safety
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
      
      insertNode.run({
        id: nodeId,
        name: ent.text,
        type: ent.type.toUpperCase(),
        importance: payload.importance,
        metadata: JSON.stringify({ source_category: payload.category, tags: payload.tags })
      });
    }

    const insertEdge = db.prepare(`
      INSERT INTO edges (id, source_id, relation, target_id, confidence)
      VALUES (@id, @source_id, @relation, @target_id, @confidence)
      ON CONFLICT(source_id, relation, target_id) DO UPDATE SET
        confidence = MAX(confidence, excluded.confidence)
    `);

    // 2. Insert relationships
    for (const rel of payload.relationships) {
      const sourceId = slugify(rel.source);
      const targetId = slugify(rel.target);
      if (!sourceId || !targetId) continue;

      // In case relationship sources/targets weren't explicitly in `entities`,
      // we must ensure they exist in nodes to satisfy foreign keys.
      insertNode.run({
        id: sourceId,
        name: rel.source,
        type: 'UNKNOWN', // Fallback type
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

      // Insert the edge
      const edgeId = uuidv4();
      insertEdge.run({
        id: edgeId,
        source_id: sourceId,
        relation: rel.relation.toUpperCase().replace(/\s+/g, '_'),
        target_id: targetId,
        confidence: rel.confidence || 0.9 // Default confidence
      });
    }
  });

  transaction();
}
