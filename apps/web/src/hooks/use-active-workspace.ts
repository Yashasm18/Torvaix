import { useDBStore } from "@/store/db-store"

/**
 * The workspace every page should read and write. Falls back to the first workspace
 * when nothing is selected or the saved selection was deleted.
 */
export function useActiveWorkspace() {
  const workspaces = useDBStore((s) => s.workspaces)
  const activeWorkspaceId = useDBStore((s) => s.activeWorkspaceId)

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null

  return { workspace, workspaceId: workspace?.id ?? null }
}
