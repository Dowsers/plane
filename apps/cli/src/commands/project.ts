// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { Command } from "commander";
import { printJson, printTable, truncate } from "../output.js";
import { resolveProject } from "../resolvers.js";
import { buildContext } from "./context.js";

interface ProjectRecord {
  id: string;
  identifier: string;
  name: string;
  description?: string;
  total_members?: number;
  total_cycles?: number;
  total_modules?: number;
}

export function registerProjectCommands(program: Command): void {
  const project = program.command("project").description("Manage projects");

  project
    .command("list")
    .description("List projects in the workspace")
    .option("--limit <n>", "Page size", "50")
    .option("--all", "Fetch every page", false)
    .action(async (options: { limit: string; all: boolean }, command: Command) => {
      const ctx = buildContext(command);
      const perPage = Number(options.limit) || 50;
      const { results, truncated } = await ctx.client.paginateAll<ProjectRecord>(
        `/api/v1/workspaces/${ctx.workspace}/projects/`,
        {},
        { perPage, all: options.all }
      );

      if (ctx.output === "json") {
        printJson(results);
        return;
      }
      printTable(results, [
        { key: "identifier", header: "KEY" },
        { key: "name", header: "NAME", format: (v) => truncate(String(v ?? ""), 40) },
        { key: "total_members", header: "MEMBERS" },
        { key: "id", header: "ID" },
      ]);
      if (truncated) process.stdout.write(`Showing first ${perPage}. Use --all to fetch every page.\n`);
    });

  project
    .command("view <ref>")
    .description("Show a project by identifier, name, or UUID")
    .action(async (ref: string, _options: unknown, command: Command) => {
      const ctx = buildContext(command);
      const record = await resolveProject(ctx.client, ctx.workspace, ref);
      const { data: full } = await ctx.client.get<ProjectRecord>(
        `/api/v1/workspaces/${ctx.workspace}/projects/${record.id}/`
      );

      if (ctx.output === "json") {
        printJson(full);
        return;
      }
      printTable(
        [
          { field: "Key", value: full.identifier },
          { field: "Name", value: full.name },
          { field: "Description", value: full.description || "-" },
          { field: "Members", value: full.total_members ?? 0 },
          { field: "Cycles", value: full.total_cycles ?? 0 },
          { field: "Modules", value: full.total_modules ?? 0 },
          { field: "ID", value: full.id },
        ],
        [
          { key: "field", header: "FIELD" },
          { key: "value", header: "VALUE" },
        ]
      );
    });

  project
    .command("create")
    .description("Create a project")
    .requiredOption("--name <name>", "Project name")
    .requiredOption("--identifier <identifier>", "Short project identifier, e.g. ENG (max 12 chars)")
    .option("--description <text>", "Project description")
    .action(async (options: { name: string; identifier: string; description?: string }, command: Command) => {
      const ctx = buildContext(command);
      const { data } = await ctx.client.post<ProjectRecord>(`/api/v1/workspaces/${ctx.workspace}/projects/`, {
        name: options.name,
        identifier: options.identifier,
        ...(options.description ? { description: options.description } : {}),
      });

      if (ctx.output === "json") {
        printJson(data);
        return;
      }
      process.stdout.write(`Created project ${data.identifier} (${data.id}).\n`);
    });
}
