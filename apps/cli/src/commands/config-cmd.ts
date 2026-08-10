// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { Command } from "commander";
import { saveConfig } from "../config.js";

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage the local CLI configuration file");

  config
    .command("set-workspace <slug>")
    .description("Set the default workspace slug used when --workspace is omitted (exigence 2)")
    .action((slug: string) => {
      saveConfig({ default_workspace: slug });
      process.stdout.write(`Default workspace set to "${slug}".\n`);
    });
}
