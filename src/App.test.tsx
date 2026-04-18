import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("starts a tournament and restores progress from localStorage", () => {
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Başlat" }));

    const choiceButtons = document.querySelectorAll<HTMLButtonElement>(".choice-card");
    expect(choiceButtons).toHaveLength(2);
    fireEvent.click(choiceButtons[0]);

    expect(screen.getByText("1 / 63")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("yansanayi-uwufufu:v1") ?? "{}").gamesByPack["tr-pop-rap"].choices).toHaveLength(1);

    unmount();
    render(<App />);

    expect(screen.getByText("1 / 63")).toBeInTheDocument();
  });

  it("imports a YouTube pack and renders embed choices", async () => {
    const { container } = render(<App />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const youtubePack = makeYouTubePack();
    const file = new File([JSON.stringify(youtubePack)], "youtube-pack.json", {
      type: "application/json",
    });

    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });

    await screen.findByText("Fixture YouTube Pack içe aktarıldı.");
    fireEvent.click(screen.getByRole("button", { name: "Başlat" }));

    await waitFor(() => {
      expect(container.querySelectorAll("iframe")).toHaveLength(2);
    });

    const firstFrame = container.querySelector("iframe");
    expect(firstFrame?.src).toContain("youtube-nocookie.com/embed/");

    fireEvent.click(screen.getAllByRole("button", { name: "Bunu seç" })[0]);
    expect(screen.getByText("1 / 7")).toBeInTheDocument();
  });

  it("converts a pasted YouTube playlist URL through the local API", async () => {
    const youtubePack = makeYouTubePack();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pack: youtubePack }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.change(screen.getByLabelText("Playlist URL"), {
      target: { value: "https://www.youtube.com/playlist?list=PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "URL'den kaydet" }));

    await screen.findByText("Fixture YouTube Pack kaydedildi. 8 video eklendi.");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/youtube-playlist",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(screen.getByDisplayValue("Fixture YouTube Pack")).toBeInTheDocument();
  });

  it("toggles side panels and persists UI preferences", () => {
    const { unmount } = render(<App />);

    expect(screen.getByRole("complementary", { name: "Oyun ayarları" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Sıralama" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sol paneli kapat" }));

    expect(screen.queryByRole("complementary", { name: "Oyun ayarları" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Sıralama" })).toBeInTheDocument();

    unmount();
    render(<App />);

    expect(screen.queryByRole("complementary", { name: "Oyun ayarları" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sol paneli aç" }));
    expect(screen.getByRole("complementary", { name: "Oyun ayarları" })).toBeInTheDocument();
  });

  it("focus mode hides both side panels", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Odak modunu aç" }));

    expect(screen.queryByRole("complementary", { name: "Oyun ayarları" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Sıralama" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odak modunu kapat" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Odak modunu kapat" }));

    expect(screen.getByRole("complementary", { name: "Oyun ayarları" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Sıralama" })).toBeInTheDocument();
  });

  it("converts a pasted Spotify playlist URL through the local API", async () => {
    const spotifyPack = makeSpotifyPack();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pack: spotifyPack }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.change(screen.getByLabelText("Playlist URL"), {
      target: { value: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
    });
    fireEvent.click(screen.getByRole("button", { name: "URL'den kaydet" }));

    await screen.findByText("Fixture Spotify Pack kaydedildi. 8 şarkı eklendi.");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spotify-playlist",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(screen.getByDisplayValue("Fixture Spotify Pack")).toBeInTheDocument();
  });

  it("deletes a saved custom pack and returns to the built-in pack", async () => {
    const youtubePack = makeYouTubePack();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pack: youtubePack }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.queryByRole("button", { name: "Kaydedilen desteyi sil" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Playlist URL"), {
      target: { value: "https://www.youtube.com/playlist?list=PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "URL'den kaydet" }));

    await screen.findByText("Fixture YouTube Pack kaydedildi. 8 video eklendi.");
    expect(screen.getByDisplayValue("Fixture YouTube Pack")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Başlat" }));
    expect(screen.getByText("0 / 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kaydedilen desteyi sil" }));

    expect(screen.getByDisplayValue("Türkçe Pop / Rap")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kaydedilen desteyi sil" })).not.toBeInTheDocument();
    expect(screen.getByText("Built-in deste silinemez.")).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("yansanayi-uwufufu:v1") ?? "{}");
      expect(stored.gamesByPack["yt-fixture-pack"]).toBeUndefined();
    });
  });
});

function makeYouTubePack() {
  return {
    schemaVersion: 1,
    id: "yt-fixture-pack",
    title: "Fixture YouTube Pack",
    description: "Fixture",
    defaultBracketSize: 8,
    generatedAt: "2026-04-18T00:00:00.000Z",
    sourceRefs: [{ label: "fixture" }],
    items: [
      "yJpJCZYTL74",
      "icZ-OlVSvb4",
      "U66ixhdbxEI",
      "dQw4w9WgXcQ",
      "mRD0-GxqHVo",
      "k85mRPqvMbE",
      "6rgStv12dwA",
      "9bZkp7q19f0",
    ].map((id, index) => ({
      id: `yt-${id}`,
      title: `Video ${index + 1}`,
      artist: "YouTube",
      category: "mixed/unknown",
      rankScore: 8 - index,
      youtubeVideoId: id,
      youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
      durationSeconds: 180 + index,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      sourceRefs: [{ label: "fixture" }],
    })),
  };
}

function makeSpotifyPack() {
  return {
    schemaVersion: 1,
    id: "sp-fixture-pack",
    title: "Fixture Spotify Pack",
    description: "Fixture",
    defaultBracketSize: 8,
    generatedAt: "2026-04-18T00:00:00.000Z",
    sourceRefs: [{ label: "fixture" }],
    items: [
      "5BZsQlgw21vDOAjoqkNgKb",
      "7yNf9YjeO5JXUE3JEBgnYc",
      "5yvVYFDUpbnjcnRBgjwTzM",
      "1DwscornXpj8fmOmYVlqZt",
      "5y2ijHECwFYWqcAHKTZgzD",
      "1qbmS6ep2hbBRaEZFpn7BX",
      "6gkbtMtioHgtyGjrMel6ei",
      "3oTuTpF1F3A7rEC6RKsMRz",
    ].map((id, index) => ({
      id: `sp-${id}`,
      title: `Track ${index + 1}`,
      artist: "Spotify",
      category: "mixed/unknown",
      rankScore: 8 - index,
      spotifyTrackId: id,
      spotifyUrl: `https://open.spotify.com/track/${id}`,
      durationSeconds: 180 + index,
      thumbnailUrl: "https://i.scdn.co/image/ab67706f00000002ef2111dd20e0445ba6f61673",
      sourceRefs: [{ label: "fixture" }],
    })),
  };
}
