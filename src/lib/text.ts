const TURKISH_FOLD_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

const COMBINING_MARKS = /\p{Mark}/gu;
const NON_WORDISH = /[^\p{Letter}\p{Number}]+/gu;

export function normalizeText(value: string): string {
  return value
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (char) => TURKISH_FOLD_MAP[char] ?? char)
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLocaleLowerCase("tr-TR")
    .replace(NON_WORDISH, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeSongKey(artist: string, title: string): string {
  return `${normalizeText(artist)}::${normalizeText(title)}`;
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}
