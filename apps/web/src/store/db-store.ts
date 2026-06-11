import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import { nanoid } from 'nanoid';
import { Workspace, Chat, Note, Message, WorkspaceTemplate } from '@torvaix/types';

interface DBState {
  workspaces: Workspace[];
  chats: Chat[];
  notes: Note[];
  messages: Message[];
  
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;

  createWorkspace: (name: string, template: WorkspaceTemplate) => Workspace;
  deleteWorkspace: (id: string) => void;

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

export const useDBStore = create<DBState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      chats: [],
      notes: [],
      messages: [],
      activeWorkspaceId: null,

      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

      createWorkspace: (name, template) => {
        const newWorkspace: Workspace = {
          id: nanoid(),
          name,
          template,
          createdAt: new Date(),
        };

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
      partialize: (state) => ({
        workspaces: state.workspaces,
        chats: state.chats,
        notes: state.notes,
        messages: state.messages,
      }), // Persist data, but not activeWorkspaceId
    }
  )
);
