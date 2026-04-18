import type { BracketSize, ChoiceRecord, GameRound, GameState, MatchSlot, PackItem, SongPack } from "../types";
import { deterministicShuffle } from "./random";

export function createGame(
  pack: SongPack,
  bracketSize: BracketSize = pack.defaultBracketSize,
  seed = `${pack.id}-${Date.now()}`,
): GameState {
  if (pack.items.length < bracketSize) {
    throw new Error(`Pack "${pack.title}" has fewer than ${bracketSize} items.`);
  }

  const selectedItems = [...pack.items]
    .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0))
    .slice(0, bracketSize);
  const entrants = deterministicShuffle(
    selectedItems.map((item) => item.id),
    seed,
  );
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    packId: pack.id,
    bracketSize,
    seed,
    createdAt: now,
    updatedAt: now,
    currentRoundIndex: 0,
    currentMatchIndex: 0,
    rounds: [{ index: 0, matches: makeMatches(entrants) }],
    choices: [],
  };
}

export function getCurrentMatch(game: GameState): MatchSlot | undefined {
  return game.rounds[game.currentRoundIndex]?.matches[game.currentMatchIndex];
}

export function selectWinner(game: GameState, winnerId: string, now = new Date().toISOString()): GameState {
  if (game.completedAt) {
    return game;
  }

  const currentMatch = getCurrentMatch(game);

  if (!currentMatch) {
    throw new Error("Current match is missing.");
  }

  if (winnerId !== currentMatch.leftId && winnerId !== currentMatch.rightId) {
    throw new Error("Winner must be one of the current match items.");
  }

  const rounds = cloneRounds(game.rounds);
  const round = rounds[game.currentRoundIndex];
  const match = round.matches[game.currentMatchIndex];
  const loserId = winnerId === match.leftId ? match.rightId : match.leftId;
  match.winnerId = winnerId;

  const choice: ChoiceRecord = {
    roundIndex: game.currentRoundIndex,
    matchIndex: game.currentMatchIndex,
    winnerId,
    loserId,
    pickedAt: now,
  };

  let currentRoundIndex = game.currentRoundIndex;
  let currentMatchIndex = game.currentMatchIndex + 1;
  let completedAt: string | undefined;

  if (currentMatchIndex >= round.matches.length) {
    const winners = round.matches.map((roundMatch) => roundMatch.winnerId);

    if (winners.some((id) => !id)) {
      throw new Error("Cannot advance before all matches in the round are decided.");
    }

    if (winners.length === 1) {
      currentMatchIndex = 0;
      completedAt = now;
    } else {
      currentRoundIndex += 1;
      currentMatchIndex = 0;
      rounds.push({ index: currentRoundIndex, matches: makeMatches(winners as string[]) });
    }
  }

  return {
    ...game,
    updatedAt: now,
    currentRoundIndex,
    currentMatchIndex,
    rounds,
    choices: [...game.choices, choice],
    completedAt,
  };
}

export function undoLastChoice(game: GameState, now = new Date().toISOString()): GameState {
  const lastChoice = game.choices.at(-1);

  if (!lastChoice) {
    return game;
  }

  const rounds = cloneRounds(game.rounds).slice(0, lastChoice.roundIndex + 1);
  const match = rounds[lastChoice.roundIndex]?.matches[lastChoice.matchIndex];

  if (match) {
    delete match.winnerId;
  }

  return {
    ...game,
    updatedAt: now,
    currentRoundIndex: lastChoice.roundIndex,
    currentMatchIndex: lastChoice.matchIndex,
    rounds,
    choices: game.choices.slice(0, -1),
    completedAt: undefined,
  };
}

export function getRoundLabel(game: GameState): string {
  const remaining = game.bracketSize / 2 ** game.currentRoundIndex;

  if (game.completedAt) {
    return "Şampiyon belli";
  }

  if (remaining === 2) {
    return "Final";
  }

  if (remaining === 4) {
    return "Yarı final";
  }

  if (remaining === 8) {
    return "Çeyrek final";
  }

  return `Son ${remaining}`;
}

export function getRanking(game: GameState, items: PackItem[]): PackItem[] {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const finalWinner = game.completedAt ? game.choices.at(-1)?.winnerId : undefined;
  const rankedIds = new Set<string>();
  const ranking: PackItem[] = [];

  if (finalWinner && itemMap.has(finalWinner)) {
    ranking.push(itemMap.get(finalWinner)!);
    rankedIds.add(finalWinner);
  }

  [...game.choices]
    .sort((left, right) => {
      if (right.roundIndex !== left.roundIndex) {
        return right.roundIndex - left.roundIndex;
      }

      const leftScore = itemMap.get(left.loserId)?.rankScore ?? 0;
      const rightScore = itemMap.get(right.loserId)?.rankScore ?? 0;
      return rightScore - leftScore;
    })
    .forEach((choice) => {
      const item = itemMap.get(choice.loserId);

      if (item && !rankedIds.has(item.id)) {
        ranking.push(item);
        rankedIds.add(item.id);
      }
    });

  return ranking;
}

export function getProgress(game: GameState): { completed: number; total: number; percent: number } {
  const total = game.bracketSize - 1;
  const completed = game.choices.length;
  return { completed, total, percent: Math.round((completed / total) * 100) };
}

function makeMatches(ids: string[]): MatchSlot[] {
  if (ids.length % 2 !== 0) {
    throw new Error("Bracket rounds require an even number of items.");
  }

  const matches: MatchSlot[] = [];

  for (let index = 0; index < ids.length; index += 2) {
    matches.push({ leftId: ids[index], rightId: ids[index + 1] });
  }

  return matches;
}

function cloneRounds(rounds: GameRound[]): GameRound[] {
  return rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => ({ ...match })),
  }));
}
