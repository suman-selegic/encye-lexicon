import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SummarizeEngine, WikiEntry } from './api'

export type QueueItemStatus = 'pending' | 'running' | 'done' | 'error'

export type QueueItem = {
  id: string
  entry: WikiEntry
  status: QueueItemStatus
  summary?: string
  error?: string
}

/** One batch of randomly fetched entries, kept so a workflow can be replayed. */
export type FetchBatch = {
  id: string
  fetchedAt: number
  entries: WikiEntry[]
}

// Keep history bounded so localStorage doesn't grow without limit.
const MAX_HISTORY = 20

type AppState = {
  queue: QueueItem[]
  queueRunning: boolean
  style: string
  length: number
  engine: SummarizeEngine
  useCustomPrompt: boolean
  customPrompt: string
  fetchHistory: FetchBatch[]
  addToQueue: (entries: WikiEntry[]) => void
  recordFetch: (entries: WikiEntry[]) => void
  clearHistory: () => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  resetQueue: () => void
  updateQueueItem: (
    id: string,
    patch: Partial<Pick<QueueItem, 'status' | 'summary' | 'error'>>,
  ) => void
  setQueueRunning: (v: boolean) => void
  setStyle: (style: string) => void
  setLength: (length: number) => void
  setEngine: (engine: SummarizeEngine) => void
  setUseCustomPrompt: (v: boolean) => void
  setCustomPrompt: (prompt: string) => void
}

let _nextId = 1

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      queue: [],
      queueRunning: false,
      style: '',
      length: 200,
      engine: 'openai',
      useCustomPrompt: false,
      customPrompt: '',
      fetchHistory: [],
      addToQueue: (entries) =>
        set((s) => ({
          queue: [
            ...s.queue,
            ...entries.map((entry) => ({
              id: String(_nextId++),
              entry,
              status: 'pending' as const,
            })),
          ],
        })),
      recordFetch: (entries) =>
        set((s) => ({
          fetchHistory: [
            {
              id:
                globalThis.crypto?.randomUUID?.() ??
                `${Date.now()}-${_nextId++}`,
              fetchedAt: Date.now(),
              entries,
            },
            ...s.fetchHistory,
          ].slice(0, MAX_HISTORY),
        })),
      clearHistory: () => set({ fetchHistory: [] }),
      removeFromQueue: (id) =>
        set((s) => ({ queue: s.queue.filter((item) => item.id !== id) })),
      clearQueue: () => set({ queue: [] }),
      resetQueue: () =>
        set((s) => ({
          queue: s.queue.map((item) => ({
            ...item,
            status: 'pending' as const,
            summary: undefined,
            error: undefined,
          })),
        })),
      updateQueueItem: (id, patch) =>
        set((s) => ({
          queue: s.queue.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        })),
      setQueueRunning: (queueRunning) => set({ queueRunning }),
      setStyle: (style) => set({ style }),
      setLength: (length) => set({ length }),
      setEngine: (engine) => set({ engine }),
      setUseCustomPrompt: (useCustomPrompt) => set({ useCustomPrompt }),
      setCustomPrompt: (customPrompt) => set({ customPrompt }),
    }),
    {
      name: 'encye-lexicon-store',
      // Persist the user's summary preferences and fetch history so a workflow
      // can be replayed; the live queue and transient run state stay in memory.
      partialize: (state) => ({
        style: state.style,
        length: state.length,
        engine: state.engine,
        fetchHistory: state.fetchHistory,
      }),
    },
  ),
)
