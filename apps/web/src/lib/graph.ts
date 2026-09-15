/**
 * force-graph replaces each link's `source`/`target` id with the node object once the
 * simulation starts, so comparisons against plain ids silently stop matching.
 */
export function linkEndpointId(end: unknown): string | undefined {
  if (typeof end === "string") return end
  if (end && typeof end === "object" && "id" in end) return String((end as { id: unknown }).id)
  return undefined
}

/** Number of links touching a node, whether links still hold ids or node objects. */
export function countConnections(links: { source: unknown; target: unknown }[], nodeId: string): number {
  return links.filter((l) => linkEndpointId(l.source) === nodeId || linkEndpointId(l.target) === nodeId).length
}
