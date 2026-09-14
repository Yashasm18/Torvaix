import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import { nanoid } from 'nanoid';
import { Workspace, Chat, Note, Message, WorkspaceTemplate } from '@torvaix/types';
import {
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_STATE_VERSION,
  migrateWorkspaceState,
} from './workspace-migration';

interface DBState {
  workspaces: Workspace[];
  chats: Chat[];
  notes: Note[];
  messages: Message[];

  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;

  createWorkspace: (name: string, template: WorkspaceTemplate) => Promise<Workspace>;
  deleteWorkspace: (id: string) => void;
  syncWorkspacesToServer: () => Promise<void>;

  createChat: (workspaceId: string, title: string) => Chat;
  deleteChat: (id: string) => void;

  createNote: (workspaceId: string, title: string) => Note;
  updateNote: (id: string, content: string) => void;
  deleteNote: (id: string) => void;

  addMessage: (message: Omit<Message, 'id' | 'createdAt'>) => Message;
}

// Custom storage engine using IndexedDB
const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

/** Ensure the agent server has a row for this workspace (idempotent on the server). */
async function provisionWorkspace(workspace: Pick<Workspace, 'id' | 'name'>): Promise<void> {
  const token = localStorage.getItem('torvaix_token');
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ id: workspace.id, name: workspace.name }),
  });
  if (!res.ok) {
    throw new Error(`Workspace provisioning failed with HTTP ${res.status}`);
  }
}

export const useDBStore = create<DBState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      chats: [],
      notes: [],
      messages: [],
      activeWorkspaceId: null,

      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

      createWorkspace: async (name, template) => {
        const newWorkspace: Workspace = {
          // The first workspace is the primary one, backed by the server's "default" workspace.
          id: get().workspaces.length === 0 ? DEFAULT_WORKSPACE_ID : nanoid(),
          name,
          template,
          createdAt: new Date(),
        };

        try {
          await provisionWorkspace(newWorkspace);
        } catch (e) {
          console.error("Failed to provision workspace on backend:", e);
        }

        set((state) => ({
          workspaces: [...state.workspaces, newWorkspace],
          activeWorkspaceId: newWorkspace.id,
        }));

        // Apply templates
        if (template === 'university') {
          get().createChat(newWorkspace.id, 'General Discussion');
          get().createNote(newWorkspace.id, 'Assignments');
          get().createNote(newWorkspace.id, 'References');
        } else if (template === 'coding') {
          get().createChat(newWorkspace.id, 'Code Assistant');
          get().createNote(newWorkspace.id, 'Snippets');
        } else {
          get().createChat(newWorkspace.id, 'New Chat');
        }

        return newWorkspace;
      },

      deleteWorkspace: (id) => {
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== id),
          chats: state.chats.filter((c) => c.workspaceId !== id),
          notes: state.notes.filter((n) => n.workspaceId !== id),
          messages: state.messages.filter(
            (m) => !state.chats.find((c) => c.id === m.chatId && c.workspaceId === id)
          ),
          activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
        }));
      },

      syncWorkspacesToServer: async () => {
        // Automations, pending actions and execution logs reference the workspaces table,
        // so a workspace that was never provisioned (backend down at creation, fresh
        // server data dir) would make those writes fail.
        const results = await Promise.allSettled(get().workspaces.map(provisionWorkspace));
        results.forEach((result, i) => {
          if (result.status === 'rejected') {
            console.error(`Failed to sync workspace "${get().workspaces[i]?.name}" to backend:`, result.reason);
          }
        });
      },

      createChat: (workspaceId, title) => {
        const newChat: Chat = {
          id: nanoid(),
          workspaceId,
          title,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({ chats: [...state.chats, newChat] }));
        return newChat;
      },

      deleteChat: (id) => {
        set((state) => ({
          chats: state.chats.filter((c) => c.id !== id),
          messages: state.messages.filter((m) => m.chatId !== id),
        }));
      },

      createNote: (workspaceId, title) => {
        const newNote: Note = {
          id: nanoid(),
          workspaceId,
          title,
          content: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({ notes: [...state.notes, newNote] }));
        return newNote;
      },

      updateNote: (id, content) => {
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, content, updatedAt: new Date() } : n
          ),
        }));
      },

      deleteNote: (id) => {
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        }));
      },

      addMessage: (msgData) => {
        const newMsg: Message = {
          ...msgData,
          id: nanoid(),
          createdAt: new Date(),
        };
        set((state) => ({
          messages: [...state.messages, newMsg],
          chats: state.chats.map((c) =>
            c.id === msgData.chatId ? { ...c, updatedAt: new Date() } : c
          ),
        }));
        return newMsg;
      },
    }),
    {
      name: 'torvaix-db',
      storage: createJSONStorage(() => idbStorage),
      version: WORKSPACE_STATE_VERSION,
      migrate: (persisted, fromVersion) =>
        migrateWorkspaceState(persisted as Partial<DBState>, fromVersion) as DBState,
      partialize: (state) => ({
        workspaces: state.workspaces,
        chats: state.chats,
        notes: state.notes,
        messages: state.messages,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.syncWorkspacesToServer();
      },
    }
  )
);
