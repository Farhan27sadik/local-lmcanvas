import { readFile } from "node:fs/promises";
import type { ModelChecks } from "@shared/types";
import { MODEL_CHECKS_FILE, atomicWriteFile, ensureDirs } from "./paths";

/** Saved model-check results. Missing or unreadable means nothing has been checked yet. */
export async function readModelChecks(): Promise<ModelChecks> {
  try {
    const parsed: unknown = JSON.parse(await readFile(MODEL_CHECKS_FILE, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ModelChecks) : {};
  } catch {
    return {};
  }
}

export async function writeModelChecks(checks: ModelChecks): Promise<void> {
  await ensureDirs();
  await atomicWriteFile(MODEL_CHECKS_FILE, JSON.stringify(checks, null, 2));
}
