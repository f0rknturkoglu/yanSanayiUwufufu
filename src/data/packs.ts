import trPopRapPack from "./packs/tr-pop-rap.json";
import type { SongPack } from "../types";
import { assertValidPack } from "../lib/pack";

const builtInPacks = [trPopRapPack as SongPack];

builtInPacks.forEach(assertValidPack);

export { builtInPacks };
