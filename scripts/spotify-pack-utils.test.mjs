import { describe, expect, it, vi } from "vitest";
import { convertSpotifyEmbedToPack, fetchTrackCovers, parseSpotifyPlaylistId } from "./spotify-pack-utils.mjs";

const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            type: "playlist",
            id: "37i9dQZF1DXcBWIGoYBM5M",
            title: "Today's Top Hits",
            subtitle: "Spotify",
            visualIdentity: {
              image: [
                {
                  url: "https://i.scdn.co/image/ab67706f00000002ef2111dd20e0445ba6f61673",
                  maxWidth: 300,
                  maxHeight: 300,
                },
              ],
            },
            trackList: [
              ["5BZsQlgw21vDOAjoqkNgKb", "DAISIES", "Justin Bieber"],
              ["7yNf9YjeO5JXUE3JEBgnYc", "Babydoll", "Dominic Fike"],
              ["5yvVYFDUpbnjcnRBgjwTzM", "Dracula - JENNIE Remix", "Tame Impala, JENNIE"],
              ["1DwscornXpj8fmOmYVlqZt", "Stateside + Zara Larsson", "PinkPantheress, Zara Larsson"],
              ["5y2ijHECwFYWqcAHKTZgzD", "Risk It All", "Bruno Mars"],
              ["1qbmS6ep2hbBRaEZFpn7BX", "Man I Need", "Olivia Dean"],
              ["6gkbtMtioHgtyGjrMel6ei", "drop dead", "Olivia Rodrigo"],
              ["3oTuTpF1F3A7rEC6RKsMRz", "Raindance (feat. Tems)", "Dave, Tems"],
            ].map(([id, title, subtitle]) => ({
              uri: `spotify:track:${id}`,
              title,
              subtitle,
              duration: 180000,
              entityType: "track",
            })),
          },
        },
      },
    },
  },
})}</script>`;

describe("spotify pack utils", () => {
  it("parses Spotify playlist IDs from URLs", () => {
    expect(parseSpotifyPlaylistId("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M",
    );
  });

  it("converts Spotify embed metadata into a cover-card pack with playlist cover fallback", () => {
    const pack = convertSpotifyEmbedToPack({
      html,
      playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      limit: 8,
    });

    expect(pack.id).toBe("sp-today-s-top-hits");
    expect(pack.defaultBracketSize).toBe(8);
    expect(pack.items).toHaveLength(8);
    expect(pack.items[0]).toMatchObject({
      title: "DAISIES",
      artist: "Justin Bieber",
      spotifyTrackId: "5BZsQlgw21vDOAjoqkNgKb",
      thumbnailUrl: "https://i.scdn.co/image/ab67706f00000002ef2111dd20e0445ba6f61673",
    });
  });

  it("fetchTrackCovers returns a map of track ID to cover URL via oEmbed", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        thumbnail_url: "https://image-cdn.spotifycdn.com/image/ab67616d00001e02fake123",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const covers = await fetchTrackCovers(["5BZsQlgw21vDOAjoqkNgKb", "7yNf9YjeO5JXUE3JEBgnYc"]);

    expect(covers.get("5BZsQlgw21vDOAjoqkNgKb")).toBe("https://image-cdn.spotifycdn.com/image/ab67616d00001e02fake123");
    expect(covers.get("7yNf9YjeO5JXUE3JEBgnYc")).toBe("https://image-cdn.spotifycdn.com/image/ab67616d00001e02fake123");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  it("fetchTrackCovers gracefully handles failures", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ thumbnail_url: "https://example.com/cover.jpg" }) })
      .mockResolvedValueOnce({ ok: false, statusText: "Not Found" });
    vi.stubGlobal("fetch", mockFetch);

    const covers = await fetchTrackCovers(["abc123", "def456"]);

    expect(covers.get("abc123")).toBe("https://example.com/cover.jpg");
    expect(covers.has("def456")).toBe(false);

    vi.restoreAllMocks();
  });
});
