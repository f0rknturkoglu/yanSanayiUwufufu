const SPOTIFY_PLAYLIST_URL = /^https:\/\/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
const SPOTIFY_TRACK_URI = /^spotify:track:([a-zA-Z0-9]{22})$/;
const DEFAULT_LIMIT = 128;

export function parseSpotifyPlaylistId(input) {
  const value = String(input ?? "").trim();

  if (!value) {
    throw new Error("Spotify playlist URL or ID is required.");
  }

  if (/^[a-zA-Z0-9]+$/.test(value) && value.length >= 10) {
    return value;
  }

  const match = value.match(SPOTIFY_PLAYLIST_URL);

  if (!match) {
    throw new Error("Spotify playlist URL must look like https://open.spotify.com/playlist/...");
  }

  return match[1];
}

export async function readSpotifyEmbedPlaylist(playlistUrl, { limit = DEFAULT_LIMIT } = {}) {
  const playlistId = parseSpotifyPlaylistId(playlistUrl);
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const response = await fetch(embedUrl, {
    headers: {
      "User-Agent": "yanSanayiUwUFUFU local playlist importer",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify embed request failed: ${response.status} ${response.statusText}`);
  }

  return {
    playlistId,
    html: await response.text(),
    limit,
  };
}

export function convertSpotifyEmbedToPack({ html, playlistUrl, limit = DEFAULT_LIMIT }) {
  const nextData = extractNextData(html);
  const entity = nextData?.props?.pageProps?.state?.data?.entity;

  if (!entity || !Array.isArray(entity.trackList)) {
    throw new Error("Spotify playlist track list could not be found.");
  }

  const playlistId = entity.id || parseSpotifyPlaylistId(playlistUrl);
  const title = entity.title || entity.name || `Spotify Playlist ${playlistId}`;
  const playlistCoverUrl = getPlaylistCoverUrl(entity);
  const items = entity.trackList
    .filter((track) => track?.entityType === "track")
    .slice(0, limit)
    .flatMap((track, index) => {
      const trackId = parseSpotifyTrackId(track.uri);

      if (!trackId) {
        return [];
      }

      return [
        {
          id: `sp-${trackId}`,
          title: cleanText(track.title) || `Track ${index + 1}`,
          artist: cleanText(track.subtitle) || "Spotify",
          category: "mixed/unknown",
          rankScore: Math.max(1, limit - index),
          spotifyTrackId: trackId,
          spotifyUrl: `https://open.spotify.com/track/${trackId}`,
          durationSeconds: Number.isFinite(track.duration) ? Math.round(track.duration / 1000) : undefined,
          thumbnailUrl: getTrackCoverUrl(track) || playlistCoverUrl,
          sourceRefs: [{ label: "Spotify playlist", url: playlistUrl }],
        },
      ];
    });

  if (items.length < 8) {
    throw new Error(`Spotify playlist must contain at least 8 readable tracks; found ${items.length}.`);
  }

  return {
    schemaVersion: 1,
    id: `sp-${slugify(title) || playlistId}`,
    title,
    description: `Spotify playlist import. ${items.length} tracks. Cover cards only; no Spotify embed playback.`,
    defaultBracketSize: chooseDefaultBracketSize(items.length),
    generatedAt: new Date().toISOString(),
    sourceRefs: [
      { label: "Spotify playlist", url: playlistUrl },
      { label: "Generated from Spotify embed metadata" },
    ],
    items,
  };
}

export function chooseDefaultBracketSize(count) {
  if (count >= 128) return 128;
  if (count >= 64) return 64;
  if (count >= 32) return 32;
  if (count >= 16) return 16;
  return 8;
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (!match) {
    throw new Error("Spotify embed metadata was not found.");
  }

  return JSON.parse(decodeHtml(match[1]));
}

function getPlaylistCoverUrl(entity) {
  const images = entity.visualIdentity?.image ?? entity.coverArt?.sources ?? [];
  const url = getBestImageUrl(images);

  if (!url) {
    throw new Error("Spotify playlist cover image was not found.");
  }

  return url;
}

export function applyTrackCovers(pack, covers) {
  for (const item of pack.items) {
    if (item.spotifyTrackId && covers.has(item.spotifyTrackId)) {
      const trackCover = covers.get(item.spotifyTrackId);

      if (trackCover) {
        item.thumbnailUrl = trackCover;
      }
    }
  }

  return pack;
}

export async function fetchTrackCovers(trackIds, { concurrency = 8, timeoutMs = 4000, maxTotalMs = 12_000 } = {}) {
  const covers = new Map();
  const batchSize = Math.max(1, concurrency);
  const ids = [...new Set(trackIds)];
  const startedAt = Date.now();

  for (let i = 0; i < ids.length; i += batchSize) {
    if (Date.now() - startedAt > maxTotalMs) {
      break;
    }

    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const url = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: createTimeoutSignal(timeoutMs),
        });

        if (!res.ok) return null;

        const data = await res.json();
        return { id, url: data.thumbnail_url || null };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        covers.set(result.value.id, result.value.url);
      }
    }
  }

  return covers;
}

function getTrackCoverUrl(track) {
  return (
    getBestImageUrl(track?.visualIdentity?.image) ||
    getBestImageUrl(track?.coverArt?.sources) ||
    getBestImageUrl(track?.albumOfTrack?.coverArt?.sources) ||
    getBestImageUrl(track?.album?.coverArt?.sources) ||
    getBestImageUrl(track?.images)
  );
}

function getBestImageUrl(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return "";
  }

  const sorted = [...images].sort((left, right) => (right.maxWidth ?? right.width ?? 0) - (left.maxWidth ?? left.width ?? 0));
  return sorted[0]?.url ?? "";
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

function parseSpotifyTrackId(uri) {
  const match = String(uri ?? "").match(SPOTIFY_TRACK_URI);
  return match?.[1];
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
