import type { BracketSize, PackItem, SongPack, ValidationResult } from "../types";
import { normalizeSongKey } from "./text";

const VALID_CATEGORIES = new Set(["turkish-pop", "turkish-rap", "mixed/unknown"]);
export const VALID_BRACKET_SIZES: BracketSize[] = [8, 16, 32, 64, 128];
const VALID_BRACKET_SIZE_SET = new Set<BracketSize>(VALID_BRACKET_SIZES);
const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const SPOTIFY_TRACK_ID = /^[a-zA-Z0-9]{22}$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidLocalImagePath(path: string): boolean {
  if (/^https?:\/\//i.test(path)) {
    return false;
  }

  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    return false;
  }

  return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path);
}

export function isYouTubeItem(item: PackItem): boolean {
  return typeof item.youtubeVideoId === "string" && YOUTUBE_VIDEO_ID.test(item.youtubeVideoId);
}

export function getYouTubeEmbedUrl(item: PackItem): string {
  if (!isYouTubeItem(item)) {
    throw new Error(`Item "${item.id}" is not a YouTube item.`);
  }

  return `https://www.youtube-nocookie.com/embed/${item.youtubeVideoId}?rel=0&modestbranding=1&playsinline=1`;
}

export function isSpotifyItem(item: PackItem): boolean {
  return typeof item.spotifyTrackId === "string" && SPOTIFY_TRACK_ID.test(item.spotifyTrackId);
}

export function validatePack(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainRecord(input)) {
    return { ok: false, errors: ["Pack must be a JSON object."], warnings };
  }

  const pack = input as Partial<SongPack>;

  if (pack.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }

  if (!pack.id || typeof pack.id !== "string") {
    errors.push("id is required.");
  }

  if (!pack.title || typeof pack.title !== "string") {
    errors.push("title is required.");
  }

  if (!VALID_BRACKET_SIZE_SET.has(Number(pack.defaultBracketSize) as BracketSize)) {
    errors.push("defaultBracketSize must be 8, 16, 32, 64, or 128.");
  }

  if (!Array.isArray(pack.items)) {
    errors.push("items must be an array.");
    return { ok: false, errors, warnings };
  }

  if (pack.items.length < 8) {
    errors.push("Pack must contain at least 8 items.");
  }

  const ids = new Set<string>();
  const normalizedKeys = new Map<string, string>();

  pack.items.forEach((item, index) => {
    const prefix = `items[${index}]`;

    if (!isPlainRecord(item)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }

    const candidate = item as Partial<PackItem>;

    if (!candidate.id || typeof candidate.id !== "string") {
      errors.push(`${prefix}.id is required.`);
    } else if (ids.has(candidate.id)) {
      errors.push(`${prefix}.id duplicates "${candidate.id}".`);
    } else {
      ids.add(candidate.id);
    }

    if (!candidate.title || typeof candidate.title !== "string") {
      errors.push(`${prefix}.title is required.`);
    }

    if (!candidate.artist || typeof candidate.artist !== "string") {
      errors.push(`${prefix}.artist is required.`);
    }

    if (!candidate.category || !VALID_CATEGORIES.has(candidate.category)) {
      errors.push(`${prefix}.category must be turkish-pop, turkish-rap, or mixed/unknown.`);
    }

    const hasLocalImage = typeof candidate.imagePath === "string" && candidate.imagePath.length > 0;
    const hasYouTubeVideo = typeof candidate.youtubeVideoId === "string" && candidate.youtubeVideoId.length > 0;
    const hasSpotifyTrack = typeof candidate.spotifyTrackId === "string" && candidate.spotifyTrackId.length > 0;
    const hasRemoteThumbnail = typeof candidate.thumbnailUrl === "string" && /^https:\/\//i.test(candidate.thumbnailUrl);

    if (!hasLocalImage && !hasYouTubeVideo && !(hasSpotifyTrack && hasRemoteThumbnail)) {
      errors.push(`${prefix} must include imagePath, youtubeVideoId, or spotifyTrackId with thumbnailUrl.`);
    }

    if (hasLocalImage && !isValidLocalImagePath(candidate.imagePath!)) {
      errors.push(`${prefix}.imagePath must be a local relative image path.`);
    }

    if (hasYouTubeVideo && !YOUTUBE_VIDEO_ID.test(candidate.youtubeVideoId!)) {
      errors.push(`${prefix}.youtubeVideoId must be an 11-character YouTube video ID.`);
    }

    if (candidate.youtubeUrl && !/^https:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/.test(candidate.youtubeUrl)) {
      errors.push(`${prefix}.youtubeUrl must be a valid YouTube watch URL.`);
    }

    if (hasSpotifyTrack && !SPOTIFY_TRACK_ID.test(candidate.spotifyTrackId!)) {
      errors.push(`${prefix}.spotifyTrackId must be a 22-character Spotify track ID.`);
    }

    if (candidate.spotifyUrl && !/^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]{22}/.test(candidate.spotifyUrl)) {
      errors.push(`${prefix}.spotifyUrl must be a valid Spotify track URL.`);
    }

    if (
      typeof candidate.durationSeconds === "number" &&
      (!Number.isFinite(candidate.durationSeconds) || candidate.durationSeconds < 0)
    ) {
      errors.push(`${prefix}.durationSeconds must be a non-negative finite number.`);
    }

    if (!Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length === 0) {
      errors.push(`${prefix}.sourceRefs must contain at least one source reference.`);
    }

    if (typeof candidate.rankScore === "number" && !Number.isFinite(candidate.rankScore)) {
      errors.push(`${prefix}.rankScore must be finite.`);
    }

    if (
      typeof candidate.year === "number" &&
      (!Number.isInteger(candidate.year) || candidate.year < 1950 || candidate.year > 2100)
    ) {
      errors.push(`${prefix}.year must be a plausible integer year.`);
    }

    if (candidate.artist && candidate.title) {
      const key = normalizeSongKey(candidate.artist, candidate.title);
      const previousId = normalizedKeys.get(key);

      if (previousId) {
        warnings.push(`${prefix} may duplicate ${previousId}.`);
      } else if (candidate.id) {
        normalizedKeys.set(key, candidate.id);
      }
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

export function assertValidPack(input: unknown): asserts input is SongPack {
  const result = validatePack(input);

  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }
}

export function getBracketSizesForPack(pack: SongPack): BracketSize[] {
  return VALID_BRACKET_SIZES.filter((size) => pack.items.length >= size);
}

export function getItemMap(pack: SongPack): Map<string, PackItem> {
  return new Map(pack.items.map((item) => [item.id, item]));
}

export function resolveAssetPath(imagePath: string): string {
  const baseUrl = import.meta.env.BASE_URL || "/";

  if (baseUrl === "./") {
    return `./${imagePath}`;
  }

  return `${baseUrl.replace(/\/$/, "")}/${imagePath}`;
}
