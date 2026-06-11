import { useDBStore } from "@/store/db-store";

export function exportWorkspaceAsJSON(workspaceId: string) {
  const state = useDBStore.getState();
  
  const workspace = state.workspaces.find(w => w.id === workspaceId);
  if (!workspace) return;

  const chats = state.chats.filter(c => c.workspaceId === workspaceId);
  const notes = state.notes.filter(n => n.workspaceId === workspaceId);
  const messages = state.messages.filter(m => chats.some(c => c.id === m.chatId));

  const exportData = {
    workspace,
    chats,
    notes,
    messages,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href",     dataStr);
  downloadAnchorNode.setAttribute("download", `workspace-${workspace.name.toLowerCase().replace(/\s+/g, '-')}.json`);
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}
