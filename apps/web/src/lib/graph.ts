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

/** Radius of a node on the canvas, from its 1-10 importance: big enough to click, never huge. */
export function nodeRadius(importance: number | null | undefined): number {
  const score = typeof importance === "number" && Number.isFinite(importance) ? Math.min(Math.max(importance, 1), 10) : 5
  return 6 + score * 0.8
}

/** A relation as people read it: "BUILT_ON" becomes "built on". */
export function relationLabel(relation: string | null | undefined): string {
  return (relation ?? "").toLowerCase().replace(/_+/g, " ").trim()
}

/** Shortens a long node name so labels don't run across the graph. */
export function shortLabel(name: string, max = 28): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name
}

/**
 * Zoom level that shows a whole graph of this size in the view, capped so a graph of two or
 * three nodes isn't blown up to fill the screen.
 */
export function fitZoom(view: { width: number; height: number }, graph: { width: number; height: number }, padding = 80, maxZoom = 2): number {
  const zoomX = (view.width - padding * 2) / Math.max(graph.width, 1)
  const zoomY = (view.height - padding * 2) / Math.max(graph.height, 1)
  const zoom = Math.min(zoomX, zoomY, maxZoom)
  return Number.isFinite(zoom) && zoom > 0.05 ? zoom : 0.05
}
