import { create } from 'zustand';

export type Toast = {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
};

type ToastState = {
  items: Toast[];
  show: (message: string, kind?: Toast['kind'], durationMs?: number) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  show: (message, kind = 'info', durationMs = 2800) => {
    const id = nextId++;
    set((s) => ({ items: [...s.items, { id, message, kind }] }));
    window.setTimeout(() => get().dismiss(id), durationMs);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));
