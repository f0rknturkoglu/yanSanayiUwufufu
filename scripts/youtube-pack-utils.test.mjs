import { afterEach, describe, expect, it, vi } from "vitest";
import { convertPlaylistToPack, parseYouTubePlaylistId, parseVideoTitle, readPlaylistWithYouTubePage } from "./youtube-pack-utils.mjs";

const fixture = {
  id: "PL4N9oNbOHXBVfjv_uf-DxsP34mfEM2ixW",
  title: "Best Turkish Pop Music",
  webpage_url: "https://www.youtube.com/playlist?list=PL4N9oNbOHXBVfjv_uf-DxsP34mfEM2ixW",
  channel: "Believe In Yourself",
  entries: [
    { id: "yJpJCZYTL74", title: "Aleyna Tilki - Sen Olsan Bari", duration: 189, uploader: "netd müzik" },
    { id: "icZ-OlVSvb4", title: "Gulsen - Bangir Bangir", duration: 234, uploader: "netd müzik" },
    { id: "U66ixhdbxEI", title: "Tarkan - Yolla", duration: 286, uploader: "netd müzik" },
    { id: "dQw4w9WgXcQ", title: "Single Title", duration: 212, uploader: "Uploader" },
    { id: "mRD0-GxqHVo", title: "Mabel Matiz - Antidepresan (Official Video)", duration: 204, uploader: "Mabel Matiz" },
    { id: "k85mRPqvMbE", title: "Edis - Martılar", duration: 190, uploader: "Edis" },
    { id: "6rgStv12dwA", title: "Simge - Aşkın Olayım", duration: 213, uploader: "Simge" },
    { id: "9bZkp7q19f0", title: "Hadise - Hay Hay", duration: 205, uploader: "Hadise" },
    { id: "bad", title: "Invalid", duration: 1, uploader: "Invalid" },
  ],
};

describe("youtube pack utils", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses playlist IDs from URLs", () => {
    expect(parseYouTubePlaylistId(fixture.webpage_url)).toBe(fixture.id);
  });

  it("splits common artist-title video names", () => {
    expect(parseVideoTitle("Aleyna Tilki - Sen Olsan Bari")).toEqual({
      artist: "Aleyna Tilki",
      title: "Sen Olsan Bari",
    });
  });

  it("converts yt-dlp flat playlist JSON into an importable pack", () => {
    const pack = convertPlaylistToPack(fixture, { sourceUrl: fixture.webpage_url, limit: 8 });

    expect(pack.defaultBracketSize).toBe(8);
    expect(pack.items).toHaveLength(8);
    expect(pack.items[0]).toMatchObject({
      id: "yt-yJpJCZYTL74",
      artist: "Aleyna Tilki",
      title: "Sen Olsan Bari",
      youtubeVideoId: "yJpJCZYTL74",
    });
    expect(pack.items[4].title).toBe("Antidepresan");
  });

  it("reads YouTube page metadata when yt-dlp is not available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => makeYouTubePageFixture(),
      }),
    );

    const { playlist } = await readPlaylistWithYouTubePage(fixture.webpage_url, { limit: 8 });
    const pack = convertPlaylistToPack(playlist, {
      sourceUrl: fixture.webpage_url,
      limit: 8,
      generatorLabel: "Generated from YouTube page metadata",
    });

    expect(playlist.title).toBe("Page Fixture Playlist");
    expect(pack.items).toHaveLength(8);
    expect(pack.sourceRefs[1].label).toBe("Generated from YouTube page metadata");
    expect(pack.items[0]).toMatchObject({
      artist: "Artist 1",
      title: "Title 1",
      youtubeVideoId: "yJpJCZYTL74",
    });
  });
});

function makeYouTubePageFixture() {
  const entries = fixture.entries.slice(0, 8).map((entry, index) => ({
    playlistVideoRenderer: {
      videoId: entry.id,
      title: { runs: [{ text: `Artist ${index + 1} - Title ${index + 1}` }] },
      shortBylineText: { runs: [{ text: `Channel ${index + 1}` }] },
      lengthSeconds: String(entry.duration),
    },
  }));
  const initialData = {
    metadata: {
      playlistMetadataRenderer: {
        title: "Page Fixture Playlist",
      },
    },
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      itemSectionRenderer: {
                        contents: entries,
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };

  return `<html><script>var ytInitialData = ${JSON.stringify(initialData)};</script></html>`;
}
