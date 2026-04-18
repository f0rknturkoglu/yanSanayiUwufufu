export type PackCategory = "turkish-pop" | "turkish-rap" | "mixed/unknown";
export type BracketSize = 8 | 16 | 32 | 64 | 128;

export interface SourceRef {
  label: string;
  url?: string;
  retrievedAt?: string;
}

export interface PackItem {
  id: string;
  title: string;
  artist: string;
  category: PackCategory;
  year?: number;
  rankScore?: number;
  imagePath?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  spotifyTrackId?: string;
  spotifyUrl?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  sourceRefs: SourceRef[];
}

export interface SongPack {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  defaultBracketSize: BracketSize;
  generatedAt: string;
  sourceRefs: SourceRef[];
  items: PackItem[];
}

export interface MatchSlot {
  leftId: string;
  rightId: string;
  winnerId?: string;
}

export interface GameRound {
  index: number;
  matches: MatchSlot[];
}

export interface ChoiceRecord {
  roundIndex: number;
  matchIndex: number;
  winnerId: string;
  loserId: string;
  pickedAt: string;
}

export interface GameState {
  schemaVersion: 1;
  packId: string;
  bracketSize: BracketSize;
  seed: string;
  createdAt: string;
  updatedAt: string;
  currentRoundIndex: number;
  currentMatchIndex: number;
  rounds: GameRound[];
  choices: ChoiceRecord[];
  completedAt?: string;
}

export interface UiPreferences {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  focusMode: boolean;
}

export interface SavedSession {
  schemaVersion: 1;
  selectedPackId: string;
  bracketSize: BracketSize;
  customPacks: SongPack[];
  gamesByPack: Record<string, GameState>;
  uiPreferences: UiPreferences;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
