import { describe, expect, it } from "vitest";
import trPopRapPack from "../data/packs/tr-pop-rap.json";
import type { SongPack } from "../types";
import { createGame, getCurrentMatch, getProgress, getRanking, selectWinner, undoLastChoice } from "./bracket";

const pack = trPopRapPack as SongPack;

describe("bracket engine", () => {
  it("creates deterministic first-round matchups", () => {
    const first = createGame(pack, 64, "fixed-seed");
    const second = createGame(pack, 64, "fixed-seed");

    expect(first.rounds[0].matches).toEqual(second.rounds[0].matches);
    expect(first.rounds[0].matches).toHaveLength(32);
  });

  it("supports undo after a pick", () => {
    const game = createGame(pack, 8, "undo-seed");
    const match = getCurrentMatch(game)!;
    const picked = selectWinner(game, match.leftId, "2026-04-18T00:00:00.000Z");
    const undone = undoLastChoice(picked, "2026-04-18T00:01:00.000Z");

    expect(picked.choices).toHaveLength(1);
    expect(undone.choices).toHaveLength(0);
    expect(undone.currentRoundIndex).toBe(0);
    expect(undone.currentMatchIndex).toBe(0);
    expect(getCurrentMatch(undone)?.winnerId).toBeUndefined();
  });

  it("completes tournaments across supported bracket sizes", () => {
    for (const size of [8, 16, 32, 64] as const) {
      let game = createGame(pack, size, `full-run-${size}`);

      while (!game.completedAt) {
        const match = getCurrentMatch(game)!;
        game = selectWinner(game, match.leftId, "2026-04-18T00:00:00.000Z");
      }

      const ranking = getRanking(game, pack.items);
      const progress = getProgress(game);

      expect(game.choices).toHaveLength(size - 1);
      expect(ranking).toHaveLength(size);
      expect(ranking[0].id).toBe(game.choices.at(-1)?.winnerId);
      expect(progress.percent).toBe(100);
    }
  });
});
