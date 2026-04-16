import { create } from 'zustand';

type SettingsState = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
