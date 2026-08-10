#!/usr/bin/env node
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.
//
// Official data-management CLI for self-hosted Plane instances - see
// docs/feature-specs/08-api-webhooks-cli.md, section 5, in plane-selfhost
// for the full spec this implements, and this package's README.md for
// usage, exit codes, and what was verified against a real server vs. mocked.

import { Command, CommanderError } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerConfigCommands } from "./commands/config-cmd.js";
import { registerCycleCommands } from "./commands/cycle.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerIssueCommands } from "./commands/issue.js";
import { registerProjectCommands } from "./commands/project.js";
import { CliError, ExitCode } from "./errors.js";
import { CLI_VERSION } from "./version.js";

const program = new Command();

// Throw instead of calling process.exit() directly, so every exit path
// (ours and commander's own usage errors) funnels through the single
// exit-code mapping in main() below.
program.exitOverride();

program
  .name("plane")
  .description("Official data-management CLI for self-hosted Plane instances (issues, projects, cycles)")
  .version(CLI_VERSION)
  .option("--api-url <url>", "Plane instance base URL, e.g. https://plane.example.com")
  .option("--token <token>", "Plane API token (overrides PLANE_API_TOKEN and the config file)")
  .option("--workspace <slug>", "Workspace slug (overrides the configured default workspace)")
  .option("--output <mode>", "Output format: table (default) or json", "table");

registerAuthCommands(program);
registerConfigCommands(program);
registerDoctorCommand(program);
registerProjectCommands(program);
registerIssueCommands(program);
registerCycleCommands(program);

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exitCode = err.exitCode;
      return;
    }
    if (err instanceof CommanderError) {
      // commander already wrote its own help/error text to stdout/stderr
      // before throwing (exitOverride only replaces the process.exit()
      // call, not that output) - just map its exit intent onto our scheme.
      if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
        process.exitCode = ExitCode.Success;
        return;
      }
      // Unknown command/option, missing required option, bad argument, ...
      process.exitCode = ExitCode.ValidationError;
      return;
    }
    process.stderr.write(`Unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = ExitCode.GeneralError;
  }
}

void main();
