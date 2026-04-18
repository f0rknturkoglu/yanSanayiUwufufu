import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = path.join(rootDir, "src/data/packs");
const publicDir = path.join(rootDir, "public");
const validCategories = new Set(["turkish-pop", "turkish-rap", "mixed/unknown"]);
const validSizes = new Set([8, 16, 32, 64, 128]);
const youtubeVideoId = /^[a-zA-Z0-9_-]{11}$/;
const spotifyTrackId = /^[a-zA-Z0-9]{22}$/;
const failures = [];

const files = (await readdir(packsDir)).filter((file) => file.endsWith(".json"));

for (const file of files) {
  const packPath = path.join(packsDir, file);
  const pack = JSON.parse(await readFile(packPath, "utf8"));
  await validatePack(pack, file);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${files.length} pack file(s).`);

async function validatePack(pack, file) {
  if (pack.schemaVersion !== 1) failures.push(`${file}: schemaVersion must be 1.`);
  if (!pack.id) failures.push(`${file}: id is required.`);
  if (!pack.title) failures.push(`${file}: title is required.`);
  if (!validSizes.has(pack.defaultBracketSize)) failures.push(`${file}: defaultBracketSize must be 8, 16, 32, 64, or 128.`);
  if (!Array.isArray(pack.items)) failures.push(`${file}: items must be an array.`);

  if (!Array.isArray(pack.items)) return;
  if (pack.items.length < 8) failures.push(`${file}: at least 8 items are required.`);

  const ids = new Set();

  for (const [index, item] of pack.items.entries()) {
    const prefix = `${file}: items[${index}]`;

    if (!item.id) failures.push(`${prefix}.id is required.`);
    if (ids.has(item.id)) failures.push(`${prefix}.id duplicates ${item.id}.`);
    ids.add(item.id);

    if (!item.title) failures.push(`${prefix}.title is required.`);
    if (!item.artist) failures.push(`${prefix}.artist is required.`);
    if (!validCategories.has(item.category)) failures.push(`${prefix}.category is invalid.`);
    if (!Array.isArray(item.sourceRefs) || item.sourceRefs.length === 0) {
      failures.push(`${prefix}.sourceRefs must not be empty.`);
    }

    const hasLocalImage = typeof item.imagePath === "string" && item.imagePath.length > 0;
    const hasYouTubeVideo = typeof item.youtubeVideoId === "string" && item.youtubeVideoId.length > 0;
    const hasSpotifyTrack = typeof item.spotifyTrackId === "string" && item.spotifyTrackId.length > 0;
    const hasRemoteThumbnail = typeof item.thumbnailUrl === "string" && /^https:\/\//i.test(item.thumbnailUrl);

    if (!hasLocalImage && !hasYouTubeVideo && !(hasSpotifyTrack && hasRemoteThumbnail)) {
      failures.push(`${prefix} must include imagePath, youtubeVideoId, or spotifyTrackId with thumbnailUrl.`);
      continue;
    }

    if (hasLocalImage) {
      if (!isValidLocalImagePath(item.imagePath)) {
        failures.push(`${prefix}.imagePath must be a local relative image path.`);
      } else {
        try {
          await access(path.join(publicDir, item.imagePath));
        } catch {
          failures.push(`${prefix}.imagePath does not exist in public/. Run npm run generate:covers.`);
        }
      }
    }

    if (hasYouTubeVideo && !youtubeVideoId.test(item.youtubeVideoId)) {
      failures.push(`${prefix}.youtubeVideoId must be an 11-character YouTube video ID.`);
    }

    if (hasSpotifyTrack && !spotifyTrackId.test(item.spotifyTrackId)) {
      failures.push(`${prefix}.spotifyTrackId must be a 22-character Spotify track ID.`);
    }
  }
}

function isValidLocalImagePath(value) {
  return (
    typeof value === "string" &&
    !/^https?:\/\//i.test(value) &&
    !value.startsWith("/") &&
    !value.includes("..") &&
    !value.includes("\\") &&
    /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(value)
  );
}
