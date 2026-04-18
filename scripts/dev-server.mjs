import http from "node:http";
import { createServer as createViteServer } from "vite";
import { convertPlaylistToPack, readPlaylistWithYtDlp, readPlaylistWithYouTubePage } from "./youtube-pack-utils.mjs";
import { applyTrackCovers, convertSpotifyEmbedToPack, fetchTrackCovers, readSpotifyEmbedPlaylist } from "./spotify-pack-utils.mjs";

const { host, port } = parseArgs(process.argv.slice(2));

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/youtube-playlist") {
    await handleYouTubePlaylist(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/spotify-playlist") {
    await handleSpotifyPlaylist(req, res);
    return;
  }

  vite.middlewares(req, res);
});

server.listen(port, host, () => {
  console.log(`Local:   http://${host}:${port}/`);
});

async function handleYouTubePlaylist(req, res) {
  try {
    const body = await readJsonBody(req);
    const playlistUrl = String(body.playlistUrl ?? "").trim();
    const limit = normalizeLimit(body.limit);

    if (!playlistUrl) {
      sendJson(res, 400, { error: "Playlist URL is required." });
      return;
    }

    const { playlist, generatorLabel } = await readYouTubePlaylist(playlistUrl, { limit });
    const pack = convertPlaylistToPack(playlist, { sourceUrl: playlistUrl, limit, generatorLabel });

    sendJson(res, 200, { pack });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Playlist could not be converted.",
    });
  }
}

async function readYouTubePlaylist(playlistUrl, { limit }) {
  try {
    const result = await readPlaylistWithYtDlp(playlistUrl, { limit });
    return {
      ...result,
      generatorLabel: "Generated with yt-dlp flat playlist metadata",
    };
  } catch {
    const result = await readPlaylistWithYouTubePage(playlistUrl, { limit });
    return {
      ...result,
      generatorLabel: "Generated from YouTube page metadata",
    };
  }
}

async function handleSpotifyPlaylist(req, res) {
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

function parseArgs(args) {
  const portIndex = args.findIndex((arg) => arg === "--port");
  const hostIndex = args.findIndex((arg) => arg === "--host");

  return {
    host: hostIndex >= 0 ? args[hostIndex + 1] : "127.0.0.1",
    port: portIndex >= 0 ? Number(args[portIndex + 1]) : 5173,
  };
}

function normalizeLimit(input) {
  const value = Number(input ?? 128);

  if (!Number.isInteger(value) || value < 8 || value > 500) {
    throw new Error("Limit must be an integer between 8 and 500.");
  }

  return value;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 100_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}
