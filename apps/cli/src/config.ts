// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.
//
// Local config file for `plane auth login` / `plane config set-workspace`
// (docs/feature-specs/08-api-webhooks-cli.md, section 5, exigence 1-2, in
// plane-selfhost). XDG convention on Linux/macOS is the only target for
// this MVP - a polished Windows path/installer is explicitly out of scope
// for this pass, so the %APPDATA% branch below is a best-effort fallback
// only, not a first-class supported path.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { dump, load } from "js-yaml";
import { AuthError, ValidationError } from "./errors.js";

export interface PlaneConfig {
  api_url?: string;
  token?: string;
  default_workspace?: string;
}

export interface GlobalOptions {
  apiUrl?: string;
  token?: string;
  workspace?: string;
}

export interface ResolvedContext {
  apiUrl: string;
  token: string;
  workspace?: string;
}

function configDir(): string {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "plane");
  if (platform() === "win32" && process.env.APPDATA) return join(process.env.APPDATA, "plane");
  return join(homedir(), ".config", "plane");
}

export function configFilePath(): string {
  return join(configDir(), "config.yml");
}

export function loadConfig(): PlaneConfig {
  const file = configFilePath();
  if (!existsSync(file)) return {};
  try {
    const parsed = load(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as PlaneConfig) : {};
  } catch {
    // A hand-edited/corrupt config file shouldn't hard-crash every single
    // command - treat it like "nothing configured yet" and point the user
    // at `auth login` to regenerate it.
    return {};
  }
}

export function saveConfig(patch: Partial<PlaneConfig>): PlaneConfig {
  const next = { ...loadConfig(), ...patch };
  mkdirSync(configDir(), { recursive: true });
  // 0o600: the file holds a live API token in plaintext (this fork has no
  // client-side workaround for that - see the CLI README's "Security"
  // section), so keep it out of other local users' reach at minimum.
  writeFileSync(configFilePath(), dump(next), { mode: 0o600 });
  return next;
}

/**
 * Precedence, per exigence 1: explicit flag > environment variable >
 * config file. `requireWorkspace` is only set by commands that actually
 * need one (issue/project/cycle) - `auth login`/`doctor` work without it.
 */
export function resolveContext(
  options: GlobalOptions,
  { requireWorkspace = false }: { requireWorkspace?: boolean } = {}
): ResolvedContext {
  const config = loadConfig();

  const apiUrl = options.apiUrl || process.env.PLANE_API_URL || config.api_url;
  const token = options.token || process.env.PLANE_API_TOKEN || config.token;
  const workspace = options.workspace || config.default_workspace;

  if (!apiUrl) {
    throw new ValidationError(
      "No Plane instance URL configured. Pass --api-url, set PLANE_API_URL, or run `plane auth login`."
    );
  }
  if (!token) {
    throw new AuthError("No API token configured. Pass --token, set PLANE_API_TOKEN, or run `plane auth login`.");
  }
  if (requireWorkspace && !workspace) {
    throw new ValidationError(
      "No workspace configured. Pass --workspace <slug>, or run `plane config set-workspace <slug>`."
    );
  }

  return { apiUrl: apiUrl.replace(/\/+$/, ""), token, workspace };
}
