import { describe, expect, it } from "vitest";
import trPopRapPack from "../data/packs/tr-pop-rap.json";
import type { SongPack } from "../types";
import { getBracketSizesForPack, getYouTubeEmbedUrl, isSpotifyItem, isYouTubeItem, validatePack } from "./pack";

describe("pack validation", () => {
  it("accepts the built-in Turkish pop/rap pack", () => {
    const result = validatePack(trPopRapPack);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(getBracketSizesForPack(trPopRapPack as SongPack)).toEqual([8, 16, 32, 64]);
  });

  it("rejects runtime network image URLs", () => {
    const invalidPack = structuredClone(trPopRapPack) as SongPack;
    invalidPack.items[0].imagePath = "https://example.com/cover.jpg";

    const result = validatePack(invalidPack);

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("local relative image path");
  });

  it("warns for normalized duplicate artist-title pairs", () => {
    const duplicatePack = structuredClone(trPopRapPack) as SongPack;
    duplicatePack.items[1] = {
      ...duplicatePack.items[1],
      id: "duplicate-ezhel-geceler",
      title: "Geceler!",
      artist: "EZHEL",
    };

    const result = validatePack(duplicatePack);

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("duplicate");
  });

  it("accepts YouTube items without local image paths", () => {
    const youtubePack: SongPack = {
      schemaVersion: 1,
      id: "yt-test",
      title: "YouTube Test",
      description: "Test",
      defaultBracketSize: 8,
      generatedAt: "2026-04-18T00:00:00.000Z",
      sourceRefs: [{ label: "fixture" }],
      items: Array.from({ length: 8 }, (_, index) => ({
        id: `yt-dQw4w9WgXcQ-${index}`,
        title: `Video ${index + 1}`,
        artist: "YouTube",
        category: "mixed/unknown",
        youtubeVideoId: "dQw4w9WgXcQ",
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        sourceRefs: [{ label: "fixture" }],
      })),
    };

    const result = validatePack(youtubePack);

    expect(result.ok).toBe(true);
    expect(isYouTubeItem(youtubePack.items[0])).toBe(true);
    expect(getYouTubeEmbedUrl(youtubePack.items[0])).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1",
    );
  });

  it("rejects malformed YouTube video IDs", () => {
    const invalidPack = structuredClone(trPopRapPack) as SongPack;
    invalidPack.defaultBracketSize = 8;
    invalidPack.items = invalidPack.items.slice(0, 8).map((item, index) => ({
      ...item,
      id: `yt-invalid-${index}`,
      imagePath: undefined,
      youtubeVideoId: "bad",
    }));

    const result = validatePack(invalidPack);

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("youtubeVideoId");
  });

  it("accepts Spotify items with remote cover thumbnails", () => {
    const spotifyPack: SongPack = {
      schemaVersion: 1,
      id: "sp-test",
      title: "Spotify Test",
      description: "Test",
      defaultBracketSize: 8,
      generatedAt: "2026-04-18T00:00:00.000Z",
      sourceRefs: [{ label: "fixture" }],
      items: Array.from({ length: 8 }, (_, index) => ({
        id: `sp-5BZsQlgw21vDOAjoqkNgKb-${index}`,
        title: `Track ${index + 1}`,
        artist: "Spotify",
        category: "mixed/unknown",
        spotifyTrackId: "5BZsQlgw21vDOAjoqkNgKb",
        spotifyUrl: "https://open.spotify.com/track/5BZsQlgw21vDOAjoqkNgKb",
        thumbnailUrl: "https://i.scdn.co/image/ab67706f00000002ef2111dd20e0445ba6f61673",
        sourceRefs: [{ label: "fixture" }],
      })),
    };

    const result = validatePack(spotifyPack);

    expect(result.ok).toBe(true);
    expect(isSpotifyItem(spotifyPack.items[0])).toBe(true);
  });
});
