// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { Command } from "commander";
import { PlaneClient } from "../client.js";
import { resolveContext, type GlobalOptions } from "../config.js";
import type { OutputMode } from "../output.js";

export interface CommandContext {
  client: PlaneClient;
  workspace: string;
  output: OutputMode;
}

/**
 * Every issue/project/cycle command goes through this: resolves auth +
 * workspace from flags/env/config (see config.ts), builds one client with
 * the rate-limit backoff notifier wired to stderr, per exigence 8
 * ("message d'avertissement explicite a l'utilisateur").
 */
export function buildContext(command: Command): CommandContext {
  const globalOpts = command.optsWithGlobals() as GlobalOptions & { output?: string };
  const ctx = resolveContext(globalOpts, { requireWorkspace: true });
  const output: OutputMode = globalOpts.output === "json" ? "json" : "table";

  const client = new PlaneClient({
    apiUrl: ctx.apiUrl,
    token: ctx.token,
    onRateLimited: ({ retryAfterSeconds, attempt, maxAttempts }) => {
      if (output === "json") return; // keep stdout machine-readable; still worth a stderr note
      process.stderr.write(`rate limited, retrying in ${retryAfterSeconds}s... (attempt ${attempt}/${maxAttempts})\n`);
    },
  });

  // requireWorkspace guarantees this, but resolveContext's return type is
  // shared with the no-workspace-required callers (doctor), so narrow here.
  return { client, workspace: ctx.workspace as string, output };
}
