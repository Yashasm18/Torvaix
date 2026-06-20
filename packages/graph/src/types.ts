export interface GraphNode {
  id: string; // The text of the entity, slugified or lowercased
  name: string; // The original display text
  type: string; // PERSON, PROJECT, TECHNOLOGY, etc.
  importance: number; // 1-10 scale
  metadata?: string; // JSON string for extra fields
  created_at: string;
}

export interface GraphEdge {
  id: string; // UUID or deterministic hash
  source_id: string;
  relation: string; // USES, CREATED, RELATED_TO, etc.
  target_id: string;
  confidence: number; // 0.0 - 1.0
}
