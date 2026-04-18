import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDir, "data/manual/kworb-tr-candidates.csv");
const sourceUrl = "https://kworb.net/spotify/country/tr_daily_totals.html";
const response = await fetch(sourceUrl, {
  headers: {
    "User-Agent": "yanSanayiUwUFUFU offline dataset builder",
  },
});

if (!response.ok) {
  throw new Error(`Kworb request failed: ${response.status} ${response.statusText}`);
}

const html = await response.text();
const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)]
  .map((match) => match[1])
  .map((row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanCell(cell[1])))
  .filter((cells) => cells.length >= 3)
  .slice(0, 250)
  .map((cells, index) => {
    const rawTrack = cells[1] || cells[0] || "";
    const [artist, title] = rawTrack.includes(" - ") ? rawTrack.split(" - ", 2) : ["", rawTrack];
    return {
      rank: index + 1,
      artist,
      title,
      totalStreams: cells.at(-1)?.replace(/,/g, "") ?? "",
      sourceUrl,
    };
  })
  .filter((row) => row.title);

const csv = [
  "rank,artist,title,totalStreams,sourceUrl",
  ...rows.map((row) =>
    [row.rank, row.artist, row.title, row.totalStreams, row.sourceUrl].map(quoteCsv).join(","),
  ),
].join("\n");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${csv}\n`, "utf8");
console.log(`Wrote ${rows.length} candidates to ${path.relative(rootDir, outputPath)}.`);

function cleanCell(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function quoteCsv(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
