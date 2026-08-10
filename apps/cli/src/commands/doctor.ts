// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.
//
// Connectivity/config sanity check (exigence 13). Also doubles as this
// feature's own smoke test against a real instance - see the CLI README's
// "Verification" section for what was actually run against a live server
// vs. mocked in tests.

import type { Command } from "commander";
import { PlaneClient } from "../client.js";
import { resolveContext, type GlobalOptions } from "../config.js";
import { CliError, ExitCode } from "../errors.js";

interface CurrentUser {
  email: string;
  display_name: string;
}

interface ProjectListResponse {
  total_count: number;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check connectivity, auth, and the resolved configuration")
    .action(async (_options: unknown, command: Command) => {
      const globalOpts = command.optsWithGlobals() as GlobalOptions;
      let hadFailure = false;

      let apiUrl: string;
      let token: string;
      let workspace: string | undefined;
      try {
        const ctx = resolveContext(globalOpts);
        apiUrl = ctx.apiUrl;
        token = ctx.token;
        workspace = ctx.workspace;
        process.stdout.write(`OK    config resolved (api-url=${apiUrl}, workspace=${workspace ?? "(none set)"})\n`);
      } catch (err) {
        process.stdout.write(`FAIL  config: ${(err as Error).message}\n`);
        process.exitCode = err instanceof CliError ? err.exitCode : ExitCode.ValidationError;
        return;
      }

      const client = new PlaneClient({ apiUrl, token });

      try {
        const { data } = await client.get<CurrentUser>("/api/v1/users/me/");
        process.stdout.write(`OK    authenticated as ${data.display_name || data.email}\n`);
      } catch (err) {
        process.stdout.write(`FAIL  authentication: ${(err as Error).message}\n`);
        process.exitCode = err instanceof CliError ? err.exitCode : ExitCode.NetworkError;
        hadFailure = true;
      }

      if (!hadFailure && workspace) {
        try {
          const { data } = await client.get<ProjectListResponse>(`/api/v1/workspaces/${workspace}/projects/`, {
            per_page: 1,
          });
          process.stdout.write(`OK    workspace "${workspace}" reachable (${data.total_count} project(s) visible)\n`);
        } catch (err) {
          process.stdout.write(`FAIL  workspace "${workspace}": ${(err as Error).message}\n`);
          process.exitCode = err instanceof CliError ? err.exitCode : ExitCode.NetworkError;
          hadFailure = true;
        }
      } else if (!hadFailure) {
        process.stdout.write('--    no default workspace configured (run "plane config set-workspace <slug>")\n');
      }

      if (client.lastRateLimit.limit !== undefined) {
        process.stdout.write(
          `--    rate limit: ${client.lastRateLimit.remaining ?? "?"}/${client.lastRateLimit.limit} remaining this window\n`
        );
      }

      if (!hadFailure) process.exitCode = ExitCode.Success;
    });
}
