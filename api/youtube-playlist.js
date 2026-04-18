import { convertPlaylistToPack, readPlaylistWithYouTubePage } from "../scripts/youtube-pack-utils.mjs";
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

    const { playlist } = await readPlaylistWithYouTubePage(playlistUrl, { limit });
    const pack = convertPlaylistToPack(playlist, {
      sourceUrl: playlistUrl,
      limit,
      generatorLabel: "Generated from YouTube page metadata",
    });

    sendJson(res, 200, { pack });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Playlist could not be converted.",
    });
  }
}
