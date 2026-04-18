import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packPath = path.join(rootDir, "src/data/packs/tr-pop-rap.json");
const publicDir = path.join(rootDir, "public");
const palette = [
  ["#111213", "#e84855", "#f7f8f6"],
  ["#102a43", "#f2c14e", "#f7f8f6"],
  ["#203a3d", "#1f8a70", "#f7f8f6"],
  ["#33202a", "#f05d5e", "#f7f8f6"],
  ["#1c1f33", "#62bbc1", "#f7f8f6"],
  ["#2d232e", "#f7b801", "#f7f8f6"],
];

const pack = JSON.parse(await readFile(packPath, "utf8"));

for (const [index, item] of pack.items.entries()) {
  const targetPath = path.join(publicDir, item.imagePath);
  const [background, accent, text] = palette[index % palette.length];
  const initials = item.artist
    .split(/\s+|&/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");
  const svg = makeCover({
    background,
    accent,
    text,
    initials,
    title: item.title,
    artist: item.artist,
    category: item.category === "turkish-rap" ? "RAP" : "POP",
    index: index + 1,
  });

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, svg, "utf8");
}

console.log(`Generated ${pack.items.length} offline cover placeholders.`);

function makeCover({ background, accent, text, initials, title, artist, category, index }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="${escapeXml(
    `${artist} - ${title}`,
  )}">
  <rect width="640" height="640" fill="${background}"/>
  <rect x="34" y="34" width="572" height="572" rx="34" fill="none" stroke="${accent}" stroke-width="10"/>
  <path d="M70 480 C170 390 236 548 334 438 C424 336 484 432 570 346" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>
  <circle cx="496" cy="132" r="54" fill="${accent}"/>
  <text x="70" y="160" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="800">${escapeXml(
    initials || "TR",
  )}</text>
  <text x="70" y="238" fill="${accent}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800">${category} #${index}</text>
  ${splitTitle(title)
    .map(
      (line, lineIndex) =>
        `<text x="70" y="${330 + lineIndex * 54}" fill="${text}" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="800">${escapeXml(
          line,
        )}</text>`,
    )
    .join("\n  ")}
  <text x="70" y="560" fill="${text}" opacity="0.78" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">${escapeXml(
    artist,
  )}</text>
</svg>
`;
}

function splitTitle(title) {
  const words = title.split(/\s+/);
  const lines = [""];

  for (const word of words) {
    const current = lines.at(-1);
    const next = current ? `${current} ${word}` : word;

    if (next.length > 18 && lines.length < 3) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = next;
    }
  }

  return lines;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
