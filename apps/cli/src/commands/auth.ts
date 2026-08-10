// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { Command } from "commander";
import { PlaneClient } from "../client.js";
import { loadConfig, saveConfig, type GlobalOptions } from "../config.js";
import { AuthError, ValidationError } from "../errors.js";
import { promptText } from "../prompt.js";

interface CurrentUser {
  email: string;
  display_name: string;
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authenticate the CLI against a self-hosted Plane instance");

  auth
    .command("login")
    .description("Interactively store an API token and instance URL in the local config file")
    .action(async (_options: unknown, command: Command) => {
      const globalOpts = command.optsWithGlobals() as GlobalOptions;
      const existing = loadConfig();

      const apiUrlInput =
        globalOpts.apiUrl ||
        (await promptText(`Plane instance URL${existing.api_url ? ` [${existing.api_url}]` : ""}: `));
      const apiUrl = (apiUrlInput || existing.api_url || "").trim();
      if (!apiUrl) {
        throw new ValidationError("An API URL is required, e.g. https://plane.example.com");
      }

      const token = (globalOpts.token || (await promptText("API token (Workspace Settings > API Tokens): "))).trim();
      if (!token) {
        throw new ValidationError("A token is required.");
      }

      // Validate before writing anything to disk - a bad token/URL should
      // never silently become the new default (exigence 13: doctor-style
      // connectivity validation "avant la premiere utilisation").
      const client = new PlaneClient({ apiUrl, token });
      let me: CurrentUser;
      try {
        const response = await client.get<CurrentUser>("/api/v1/users/me/");
        me = response.data;
      } catch (err) {
        if (err instanceof AuthError) {
          throw new AuthError(`Could not authenticate against ${apiUrl}: ${err.message}`);
        }
        throw err;
      }

      saveConfig({ api_url: apiUrl.replace(/\/+$/, ""), token });
      process.stdout.write(`Logged in as ${me.display_name || me.email} on ${apiUrl}. Config saved.\n`);
    });
}
