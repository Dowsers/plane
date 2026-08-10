// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.
//
// Deliberately hand-rolled instead of pulling in inquirer/prompts - the
// CLI only ever needs "ask for a line of text" and "yes/no confirm"
// (auth login, bulk-update confirmation), which node:readline covers
// without an extra dependency.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function promptText(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

/**
 * Refuses to guess consent when stdin isn't a TTY (CI, pipes, cron) -
 * callers doing a mutating action must pass --yes explicitly in that
 * case, per exigence 10 ("confirmation interactive par defaut ... --yes
 * pour le mode non-interactif").
 */
export async function confirm(question: string): Promise<boolean> {
  if (!stdin.isTTY) return false;
  const answer = (await promptText(`${question} [y/N] `)).toLowerCase();
  return answer === "y" || answer === "yes";
}
