import { useDBStore } from '@/store/db-store';

/**
 * Download a JSON backup of a workspace's browser-stored data (chats, messages, notes,
 * projects). These live in IndexedDB, so clearing site data would otherwise lose them.
 */
export function exportWorkspaceAsJSON(workspaceId: string) {
  const state = useDBStore.getState();

  const workspace = state.workspaces.find(w => w.id === workspaceId);
  if (!workspace) return;

  const chats = state.chats.filter(c => c.workspaceId === workspaceId);
  const chatIds = new Set(chats.map(c => c.id));
  const exportData = {
    workspace,
    chats,
    messages: state.messages.filter(m => chatIds.has(m.chatId)),
    notes: state.notes.filter(n => n.workspaceId === workspaceId),
    projects: state.projects.filter(p => p.workspaceId === workspaceId),
    exportedAt: new Date().toISOString(),
    version: '1.1',
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const slug = workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `torvaix-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor); // required for Firefox
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
