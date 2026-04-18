import { execFile } from "node:child_process";
import { promisify } from "node:util";

const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const DEFAULT_LIMIT = 128;
const execFileAsync = promisify(execFile);

export function parseYouTubePlaylistId(input) {
  const value = String(input ?? "").trim();

  if (!value) {
    throw new Error("Playlist URL or ID is required.");
  }

  if (/^[a-zA-Z0-9_-]+$/.test(value) && value.length >= 10) {
    return value;
  }

  const url = new URL(value);
  const list = url.searchParams.get("list");

  if (!list) {
    throw new Error("YouTube playlist URL must include a list parameter.");
  }

  return list;
}

export function parseVideoTitle(rawTitle, fallbackArtist = "YouTube") {
  const title = stripNoise(String(rawTitle ?? "").trim());
  const match = title.match(/^(.+?)\s[-–—]\s(.+)$/);

  if (!match) {
    return { artist: fallbackArtist || "YouTube", title: title || "Untitled video" };
  }

  return {
    artist: stripNoise(match[1]).trim() || fallbackArtist || "YouTube",
    title: stripNoise(match[2]).trim() || title,
  };
}

export function convertPlaylistToPack(
  playlist,
  { sourceUrl, limit = DEFAULT_LIMIT, generatorLabel = "Generated from YouTube playlist metadata" } = {},
) {
  if (!playlist || typeof playlist !== "object") {
    throw new Error("yt-dlp output must be an object.");
  }

  const entries = Array.isArray(playlist.entries) ? playlist.entries : [];
  const playlistId = playlist.id || parseYouTubePlaylistId(sourceUrl);
  const playlistTitle = playlist.title || `YouTube Playlist ${playlistId}`;
  const seen = new Set();
  const items = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !YOUTUBE_VIDEO_ID.test(entry.id) || seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    const parsedTitle = parseVideoTitle(entry.title, entry.uploader || entry.channel || playlist.channel || "YouTube");
    const rank = items.length + 1;

    items.push({
      id: `yt-${entry.id}`,
      title: parsedTitle.title,
      artist: parsedTitle.artist,
      category: "mixed/unknown",
      rankScore: Math.max(1, limit - rank + 1),
      youtubeVideoId: entry.id,
      youtubeUrl: `https://www.youtube.com/watch?v=${entry.id}`,
      durationSeconds: Number.isFinite(entry.duration) ? entry.duration : undefined,
      thumbnailUrl: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
      sourceRefs: [{ label: "YouTube playlist", url: sourceUrl || playlist.webpage_url }],
    });

    if (items.length >= limit) {
      break;
    }
  }

  if (items.length < 8) {
    throw new Error(`Playlist must contain at least 8 embeddable videos; found ${items.length}.`);
  }

  return {
    schemaVersion: 1,
    id: `yt-${slugify(playlistTitle || playlistId) || playlistId}`,
    title: playlistTitle,
    description: `YouTube playlist import. ${items.length} video, embed playback requires internet.`,
    defaultBracketSize: chooseDefaultBracketSize(items.length),
    generatedAt: new Date().toISOString(),
    sourceRefs: [
      {
        label: "YouTube playlist",
        url: sourceUrl || playlist.webpage_url,
      },
      {
        label: generatorLabel,
      },
    ],
    items,
  };
}

export async function readPlaylistWithYouTubePage(playlistUrl, { limit = DEFAULT_LIMIT } = {}) {
  const playlistId = parseYouTubePlaylistId(playlistUrl);
  const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}&hl=en&gl=US`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 yanSanayiUwUFUFU playlist importer",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube playlist page request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const initialData = extractInitialData(html);
  const entries = collectPlaylistVideos(initialData).slice(0, limit);

  if (entries.length < 8) {
    return readPlaylistFeed(playlistUrl, { limit });
  }

  return {
    playlistId,
    playlist: {
      id: playlistId,
      title: extractPlaylistTitle(initialData) || `YouTube Playlist ${playlistId}`,
      webpage_url: playlistUrl,
      entries,
    },
  };
}

export async function readPlaylistWithYtDlp(playlistUrl, { limit = DEFAULT_LIMIT } = {}) {
  const playlistId = parseYouTubePlaylistId(playlistUrl);
  const ytDlpArgs = ["--flat-playlist", "--playlist-end", String(limit), "-J", playlistUrl];

  try {
    const { stdout } = await execFileAsync("yt-dlp", ytDlpArgs, {
      maxBuffer: 64 * 1024 * 1024,
    });

    return {
      playlistId,
      playlist: JSON.parse(stdout),
    };
  } catch (error) {
    const stderr = error?.stderr ? `\n${error.stderr}` : "";
    throw new Error(`yt-dlp failed. Confirm yt-dlp is installed and the playlist is public.${stderr}`);
  }
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

function stripNoise(value) {
  return value
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s*\((official\s*)?(video|audio|music video|lyric video|lyrics|clip)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInitialData(html) {
  const patterns = ["var ytInitialData = ", "window[\"ytInitialData\"] = ", "ytInitialData = "];

  for (const pattern of patterns) {
    const markerIndex = html.indexOf(pattern);

    if (markerIndex < 0) {
      continue;
    }

    const jsonStart = html.indexOf("{", markerIndex + pattern.length);

    if (jsonStart < 0) {
      continue;
    }

    const jsonText = extractBalancedJson(html, jsonStart);

    if (jsonText) {
      return JSON.parse(jsonText);
    }
  }

  throw new Error("YouTube playlist metadata was not found.");
}

function extractBalancedJson(source, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return "";
}

function collectPlaylistVideos(root) {
  const entries = [];
  const seen = new Set();

  walk(root, (value) => {
    const renderer = value?.playlistVideoRenderer;

    if (!renderer || !YOUTUBE_VIDEO_ID.test(renderer.videoId) || seen.has(renderer.videoId)) {
      return;
    }

    seen.add(renderer.videoId);
    entries.push({
      id: renderer.videoId,
      title: readText(renderer.title) || "Untitled video",
      duration: Number.isFinite(Number(renderer.lengthSeconds)) ? Number(renderer.lengthSeconds) : undefined,
      uploader: readText(renderer.shortBylineText) || readText(renderer.ownerText) || "YouTube",
    });
  });

  return entries;
}

function extractPlaylistTitle(root) {
  const metadata = findFirst(root, (value) => value?.playlistMetadataRenderer)?.playlistMetadataRenderer;
  const header = findFirst(root, (value) => value?.playlistHeaderRenderer)?.playlistHeaderRenderer;
  const pageHeader = findFirst(root, (value) => value?.pageHeaderRenderer)?.pageHeaderRenderer;

  return (
    metadata?.title ||
    readText(header?.title) ||
    readText(pageHeader?.pageTitle) ||
    readText(pageHeader?.content?.pageHeaderViewModel?.title)
  );
}

async function readPlaylistFeed(playlistUrl, { limit = DEFAULT_LIMIT } = {}) {
  const playlistId = parseYouTubePlaylistId(playlistUrl);
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`, {
    headers: {
      "User-Agent": "yanSanayiUwUFUFU playlist importer",
      Accept: "application/xml,text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube playlist feed request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const title = decodeXml(xml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? `YouTube Playlist ${playlistId}`);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, limit).flatMap((match) => {
    const entryXml = match[1];
    const id = entryXml.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/)?.[1]?.trim();

    if (!id || !YOUTUBE_VIDEO_ID.test(id)) {
      return [];
    }

    return [
      {
        id,
        title: decodeXml(entryXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Untitled video"),
        uploader: decodeXml(entryXml.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/)?.[1] ?? "YouTube"),
      },
    ];
  });

  if (entries.length < 8) {
    throw new Error(`Playlist must contain at least 8 readable videos; found ${entries.length}.`);
  }

  return {
    playlistId,
    playlist: {
      id: playlistId,
      title,
      webpage_url: playlistUrl,
      entries,
    },
  };
}

function walk(value, visitor) {
  if (!value || typeof value !== "object") {
    return;
  }

  visitor(value);

  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visitor));
    return;
  }

  Object.values(value).forEach((item) => walk(item, visitor));
}

function findFirst(value, predicate) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (predicate(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirst(item, predicate);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  for (const item of Object.values(value)) {
    const found = findFirst(item, predicate);

    if (found) {
      return found;
    }
  }

  return undefined;
}

function readText(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.simpleText === "string") {
    return value.simpleText;
  }

  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => run?.text ?? "").join("").trim();
  }

  if (typeof value.content === "string") {
    return value.content;
  }

  return "";
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
