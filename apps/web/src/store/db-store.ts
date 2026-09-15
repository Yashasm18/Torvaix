import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import { nanoid } from 'nanoid';
import { Workspace, Chat, Note, Message, WorkspaceTemplate, Project } from '@torvaix/types';
import {
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_STATE_VERSION,
  migrateWorkspaceState,
} from './workspace-migration';
import { DEFAULT_CHAT_TITLE, deriveChatTitle, toStoredMessages, type UiMessage } from './chat-history';

interface DBState {
  workspaces: Workspace[];
  chats: Chat[];
  notes: Note[];
  messages: Message[];
  projects: Project[];

  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;

  /** Chat currently open in each workspace (workspaceId -> chatId). */
  activeChatIds: Record<string, string>;
  setActiveChat: (workspaceId: string, chatId: string) => void;
  /** Replace a chat's stored messages with the live conversation and refresh its title/updatedAt. */
  saveChatMessages: (chatId: string, messages: UiMessage[]) => void;

  createWorkspace: (name: string, template: WorkspaceTemplate) => Promise<Workspace>;
  deleteWorkspace: (id: string) => void;
  syncWorkspacesToServer: () => Promise<void>;

  createChat: (workspaceId: string, title: string) => Chat;
  deleteChat: (id: string) => void;

  createNote: (workspaceId: string, title: string) => Note;
  updateNote: (id: string, content: string) => void;
  deleteNote: (id: string) => void;

  addMessage: (message: Omit<Message, 'id' | 'createdAt'>) => Message;

  createProject: (workspaceId: string, input: Pick<Project, 'name' | 'description' | 'tags'>) => Project;
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'tags' | 'status' | 'starred'>>) => void;
  deleteProject: (id: string) => void;
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
      projects: [],
      activeWorkspaceId: null,
      activeChatIds: {},

      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

      setActiveChat: (workspaceId, chatId) =>
        set((state) => ({ activeChatIds: { ...state.activeChatIds, [workspaceId]: chatId } })),

      saveChatMessages: (chatId, uiMessages) => {
        set((state) => {
          const chat = state.chats.find((c) => c.id === chatId);
          if (!chat) return {};
          const title = chat.title === DEFAULT_CHAT_TITLE ? deriveChatTitle(uiMessages) ?? chat.title : chat.title;
          return {
            messages: [...state.messages.filter((m) => m.chatId !== chatId), ...toStoredMessages(chatId, uiMessages)],
            chats: state.chats.map((c) => (c.id === chatId ? { ...c, title, updatedAt: new Date() } : c)),
          };
        });
      },

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
          get().createChat(newWorkspace.id, DEFAULT_CHAT_TITLE);
        }

        return newWorkspace;
      },

      deleteWorkspace: (id) => {
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== id),
          chats: state.chats.filter((c) => c.workspaceId !== id),
          notes: state.notes.filter((n) => n.workspaceId !== id),
          projects: state.projects.filter((p) => p.workspaceId !== id),
          activeChatIds: Object.fromEntries(Object.entries(state.activeChatIds).filter(([workspaceId]) => workspaceId !== id)),
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
          activeChatIds: Object.fromEntries(Object.entries(state.activeChatIds).filter(([, chatId]) => chatId !== id)),
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

      createProject: (workspaceId, input) => {
        const now = new Date();
        const project: Project = {
          id: nanoid(),
          workspaceId,
          name: input.name,
          description: input.description,
          tags: input.tags,
          status: 'active',
          starred: false,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ projects: [...state.projects, project] }));
        return project;
      },

      updateProject: (id, patch) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: new Date() } : p
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
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
        projects: state.projects,
        activeChatIds: state.activeChatIds,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.syncWorkspacesToServer();
      },
    }
  )
);
