import { describe, expect, it } from "vitest";
import { normalizeSongKey, normalizeText, slugify } from "./text";

describe("text normalization", () => {
  it("folds Turkish characters without losing word identity", () => {
    expect(normalizeText("Şımarık Çınlama İğrek Özbey Güneş")).toBe("simarik cinlama igrek ozbey gunes");
  });

  it("creates stable dedupe keys for punctuation and casing variants", () => {
    expect(normalizeSongKey("İrem Derici", "Kalbimin Tek Sahibine")).toBe(
      normalizeSongKey("irem derici", "Kalbimin tek sahibine!"),
    );
  });

  it("creates local asset slugs", () => {
    expect(slugify("Ateşe Düştüm")).toBe("atese-dustum");
  });
});
