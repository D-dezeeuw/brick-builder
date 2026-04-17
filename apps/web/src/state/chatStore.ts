import { create } from 'zustand';

/**
 * Persistent room chat state.
 *
 * `displayName` is stored in localStorage so it survives reloads and
 * room swaps — users expect their chat handle to stick around. Names
 * auto-generate on first run so the prompt isn't a hard gate.
 *
 * The message list is a sliding window (last 200 kept in memory).
 * Scrolling up to load older history is out of scope.
 */

export type ChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

const MAX_IN_MEMORY = 200;
const DISPLAY_NAME_KEY = 'brick.chat.displayName';

function randomName(): string {
  const adjectives = [
    'Red',
    'Blue',
    'Yellow',
    'Green',
    'Teal',
    'Tan',
    'Swift',
    'Cosy',
    'Lucky',
    'Sunny',
    'Neat',
    'Jolly',
  ];
  const nouns = ['Brick', 'Stud', 'Plate', 'Tile', 'Slope', 'Minifig', 'Builder', 'Crafter'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${a}${n}${num}`;
}

function loadDisplayName(): string {
  if (typeof localStorage === 'undefined') return randomName();
  const existing = localStorage.getItem(DISPLAY_NAME_KEY);
  if (existing && existing.length > 0 && existing.length <= 64) return existing;
  const fresh = randomName();
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, fresh);
  } catch {
    /* private-mode / full storage — fall through */
  }
  return fresh;
}

type ChatState = {
  open: boolean;
  displayName: string;
  draft: string;
  messages: ChatMessage[];
  loading: boolean;
  setOpen: (b: boolean) => void;
  toggleOpen: () => void;
  setDisplayName: (s: string) => void;
  setDraft: (s: string) => void;
  setLoading: (b: boolean) => void;
  replaceMessages: (list: ChatMessage[]) => void;
  appendMessage: (m: ChatMessage) => void;
  clear: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  open: false,
  displayName: loadDisplayName(),
  draft: '',
  messages: [],
  loading: false,
  setOpen: (b) => set({ open: b }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setDisplayName: (s) => {
    const trimmed = s.slice(0, 64);
    try {
      localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
    } catch {
      /* ignore */
    }
    set({ displayName: trimmed });
  },
  setDraft: (s) => set({ draft: s.slice(0, 500) }),
  setLoading: (b) => set({ loading: b }),
  replaceMessages: (list) => {
    // Trust DB ordering (created_at ASC). Deduplicate by id in case a
    // concurrent realtime event sneaked in during the initial fetch.
    const seen = new Set<string>();
    const out: ChatMessage[] = [];
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    set({ messages: out.slice(-MAX_IN_MEMORY) });
  },
  appendMessage: (m) => {
    const current = get().messages;
    if (current.some((existing) => existing.id === m.id)) return;
    const next = [...current, m];
    set({ messages: next.slice(-MAX_IN_MEMORY) });
  },
  clear: () => set({ messages: [], draft: '' }),
}));
