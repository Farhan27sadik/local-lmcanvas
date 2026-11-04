import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { KimiModelInfo } from "@shared/types";
import { parseKimiModels } from "./kimiStream";

/** The model aliases in the user's Kimi config; empty when Kimi isn't installed or signed in. */
export async function listKimiModels(): Promise<KimiModelInfo[]> {
  try {
    return parseKimiModels(await readFile(join(homedir(), ".kimi-code", "config.toml"), "utf8"));
  } catch {
    return [];
  }
}
