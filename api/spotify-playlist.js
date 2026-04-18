import { applyTrackCovers, convertSpotifyEmbedToPack, fetchTrackCovers, readSpotifyEmbedPlaylist } from "../scripts/spotify-pack-utils.mjs";
import { normalizeLimit, readJsonBody, rejectNonPost, sendJson } from "./_utils.js";

export default async function handler(req, res) {
  if (rejectNonPost(req, res)) {
    return;
  }

  try {
    const body = await readJsonBody(req);
    const playlistUrl = String(body.playlistUrl ?? "").trim();
    const limit = normalizeLimit(body.limit);

    if (!playlistUrl) {
      sendJson(res, 400, { error: "Playlist URL is required." });
      return;
    }

    const { html } = await readSpotifyEmbedPlaylist(playlistUrl, { limit });
    const pack = convertSpotifyEmbedToPack({ html, playlistUrl, limit });
    const trackIds = pack.items.map((item) => item.spotifyTrackId).filter(Boolean);
    const covers = await fetchTrackCovers(trackIds);

    sendJson(res, 200, { pack: applyTrackCovers(pack, covers) });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Spotify playlist could not be converted.",
    });
  }
}
