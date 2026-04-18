import type { BracketSize, GameState, SavedSession, SongPack, UiPreferences } from "../types";

const STORAGE_KEY = "yansanayi-uwufufu:v1";

const DEFAULT_UI_PREFERENCES: UiPreferences = {
  leftPanelOpen: true,
  rightPanelOpen: true,
  focusMode: false,
};

const DEFAULT_SESSION: SavedSession = {
  schemaVersion: 1,
  selectedPackId: "tr-pop-rap",
  bracketSize: 64,
  customPacks: [],
  gamesByPack: {},
  uiPreferences: DEFAULT_UI_PREFERENCES,
};

export function loadSession(): SavedSession {
  if (!hasLocalStorage()) {
    return DEFAULT_SESSION;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULT_SESSION;
    }

    const parsed = JSON.parse(raw) as Partial<SavedSession>;

    if (parsed.schemaVersion !== 1) {
      return DEFAULT_SESSION;
    }

    return {
      schemaVersion: 1,
      selectedPackId: typeof parsed.selectedPackId === "string" ? parsed.selectedPackId : DEFAULT_SESSION.selectedPackId,
      bracketSize: isBracketSize(parsed.bracketSize) ? parsed.bracketSize : DEFAULT_SESSION.bracketSize,
      customPacks: Array.isArray(parsed.customPacks) ? (parsed.customPacks as SongPack[]) : [],
      gamesByPack: isPlainRecord(parsed.gamesByPack)
        ? (parsed.gamesByPack as Record<string, GameState>)
        : {},
      uiPreferences: parseUiPreferences(parsed.uiPreferences),
    };
  } catch {
    return DEFAULT_SESSION;
  }
}

export function saveSession(session: SavedSession): boolean {
  if (!hasLocalStorage()) {
    return false;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}

function isBracketSize(value: unknown): value is BracketSize {
  return value === 8 || value === 16 || value === 32 || value === 64 || value === 128;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUiPreferences(value: unknown): UiPreferences {
  if (!isPlainRecord(value)) {
    return DEFAULT_UI_PREFERENCES;
  }

  return {
    leftPanelOpen:
      typeof value.leftPanelOpen === "boolean" ? value.leftPanelOpen : DEFAULT_UI_PREFERENCES.leftPanelOpen,
    rightPanelOpen:
      typeof value.rightPanelOpen === "boolean" ? value.rightPanelOpen : DEFAULT_UI_PREFERENCES.rightPanelOpen,
    focusMode: typeof value.focusMode === "boolean" ? value.focusMode : DEFAULT_UI_PREFERENCES.focusMode,
  };
}
