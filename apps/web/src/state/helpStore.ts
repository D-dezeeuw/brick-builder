import { useEffect } from 'react';
import { create } from 'zustand';

const ONBOARDED_KEY = 'brick-builder:onboarded-v1';

type HelpState = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

export const useHelpStore = create<HelpState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

/**
 * First-run: open the help modal once and remember the user has seen it.
 * Uses a version-tagged storage key so we can force-show again if the help
 * content changes meaningfully in the future.
 */
export function useFirstRunHelp(): void {
  useEffect(() => {
    try {
      if (localStorage.getItem(ONBOARDED_KEY)) return;
      useHelpStore.getState().setOpen(true);
      localStorage.setItem(ONBOARDED_KEY, Date.now().toString(10));
    } catch {
      // localStorage can throw (quota, private mode). A missed onboarding
      // is fine — just don't wedge the app.
    }
  }, []);
}
