import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertPlaylistToPack, parseYouTubePlaylistId, readPlaylistWithYtDlp, slugify } from "./youtube-pack-utils.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { playlistUrl, limit } = parseArgs(process.argv.slice(2));
const playlistId = parseYouTubePlaylistId(playlistUrl);

console.log(`Reading playlist ${playlistId} with yt-dlp, limit ${limit}...`);

const { playlist } = await readPlaylistWithYtDlp(playlistUrl, { limit });
const pack = convertPlaylistToPack(playlist, { sourceUrl: playlistUrl, limit });
const outputName = `${slugify(pack.title) || playlistId}.json`;
const outputPath = path.join(rootDir, "data/generated", outputName);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");

console.log(`Wrote ${pack.items.length} videos to ${path.relative(rootDir, outputPath)}.`);
console.log("Import this JSON from the app with the upload button.");

function parseArgs(args) {
  const playlistUrl = args.find((arg) => !arg.startsWith("--"));

  if (!playlistUrl) {
    throw new Error('Usage: npm run import:youtube -- "https://www.youtube.com/playlist?list=..." --limit 128');
  }

  const limitIndex = args.findIndex((arg) => arg === "--limit");
  const limitValue = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 128;

  if (!Number.isInteger(limitValue) || limitValue < 8 || limitValue > 500) {
    throw new Error("--limit must be an integer between 8 and 500.");
  }

  return { playlistUrl, limit: limitValue };
}
