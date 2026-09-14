/**
 * The agent server always has a workspace with this id. It is the primary workspace:
 * the first workspace a user creates uses it, and API callers that omit a workspace
 * land in it.
 */
export const DEFAULT_WORKSPACE_ID = "default";

/** Version of the persisted `torvaix-db` state. Bump together with a new migration step. */
export const WORKSPACE_STATE_VERSION = 1;

interface MigratableState {
  workspaces?: Array<{ id: string; createdAt?: string | Date }>;
  chats?: Array<{ workspaceId: string }>;
  notes?: Array<{ workspaceId: string }>;
  activeWorkspaceId?: string | null;
}

function createdAtMs(value: string | Date | undefined): number {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value ?? "");
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * v0 → v1. Before v1 every page read and wrote the server's "default" workspace regardless
 * of which workspace was selected, so all existing server data lives under "default".
 * The earliest workspace adopts that id so its data stays visible; the others keep their
 * own ids and become genuinely separate. No server data is moved.
 */
export function migrateWorkspaceState<T extends MigratableState>(persisted: T, fromVersion: number): T {
  if (fromVersion >= 1) return persisted;

  const workspaces = persisted.workspaces ?? [];
  if (workspaces.length === 0 || workspaces.some((w) => w.id === DEFAULT_WORKSPACE_ID)) {
    return persisted;
  }

  const earliest = workspaces.reduce((oldest, w) =>
    createdAtMs(w.createdAt) < createdAtMs(oldest.createdAt) ? w : oldest
  );
  const legacyId = earliest.id;
  const remap = (id: string) => (id === legacyId ? DEFAULT_WORKSPACE_ID : id);

  return {
    ...persisted,
    workspaces: workspaces.map((w) => ({ ...w, id: remap(w.id) })),
    chats: persisted.chats?.map((c) => ({ ...c, workspaceId: remap(c.workspaceId) })),
    notes: persisted.notes?.map((n) => ({ ...n, workspaceId: remap(n.workspaceId) })),
    activeWorkspaceId: persisted.activeWorkspaceId ? remap(persisted.activeWorkspaceId) : persisted.activeWorkspaceId,
  };
}
