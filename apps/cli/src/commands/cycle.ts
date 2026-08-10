// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { Command } from "commander";
import { printJson, printTable } from "../output.js";
import { resolveCycle, resolveProject } from "../resolvers.js";
import { ValidationError } from "../errors.js";
import { buildContext } from "./context.js";

// apps/api/plane/api/serializers/cycle.py::CycleSerializer already
// annotates these counts server-side (CycleListCreateAPIEndpoint /
// CycleDetailAPIEndpoint's get_queryset) - exigence 6 asks for a "done /
// total" summary, which is exactly total_issues/completed_issues, so
// there is nothing to compute client-side here.
interface CycleRecord {
  id: string;
  name: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  total_issues?: number;
  completed_issues?: number;
  started_issues?: number;
  unstarted_issues?: number;
  backlog_issues?: number;
  cancelled_issues?: number;
}

export function registerCycleCommands(program: Command): void {
  const cycle = program.command("cycle").description("Manage cycles");

  cycle
    .command("list")
    .description("List cycles in a project")
    .requiredOption("-p, --project <ref>", "Project identifier, name, or UUID")
    .option("--limit <n>", "Page size", "50")
    .option("--all", "Fetch every page", false)
    .action(async (options: { project: string; limit: string; all: boolean }, command: Command) => {
      const ctx = buildContext(command);
      const project = await resolveProject(ctx.client, ctx.workspace, options.project);
      const perPage = Number(options.limit) || 50;
      const { results, truncated } = await ctx.client.paginateAll<CycleRecord>(
        `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/cycles/`,
        {},
        { perPage, all: options.all }
      );

      if (ctx.output === "json") {
        printJson(results);
        return;
      }
      printTable(results, [
        { key: "name", header: "NAME" },
        {
          key: "total_issues",
          header: "DONE/TOTAL",
          format: (_v, row) => `${row.completed_issues ?? 0}/${row.total_issues ?? 0}`,
        },
        { key: "start_date", header: "START" },
        { key: "end_date", header: "END" },
        { key: "id", header: "ID" },
      ]);
      if (truncated) process.stdout.write(`Showing first ${perPage}. Use --all to fetch every page.\n`);
    });

  cycle
    .command("view <ref>")
    .description("Show a cycle with a done/total progress summary")
    .requiredOption("-p, --project <ref>", "Project identifier, name, or UUID")
    .action(async (ref: string, options: { project: string }, command: Command) => {
      const ctx = buildContext(command);
      const project = await resolveProject(ctx.client, ctx.workspace, options.project);
      const cycleId = await resolveCycle(ctx.client, ctx.workspace, project.id, ref);
      const { data: c } = await ctx.client.get<CycleRecord>(
        `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/cycles/${cycleId}/`
      );

      if (ctx.output === "json") {
        printJson(c);
        return;
      }
      const total = c.total_issues ?? 0;
      const done = c.completed_issues ?? 0;
      const pct = total > 0 ? ` (${Math.round((done / total) * 100)}%)` : "";
      process.stdout.write(`${c.name} [${project.identifier}]\n`);
      process.stdout.write(`Progress: ${done}/${total} done${pct}\n\n`);
      printTable(
        [
          { field: "Started", value: c.started_issues ?? 0 },
          { field: "Unstarted", value: c.unstarted_issues ?? 0 },
          { field: "Backlog", value: c.backlog_issues ?? 0 },
          { field: "Cancelled", value: c.cancelled_issues ?? 0 },
          { field: "Start date", value: c.start_date ?? "-" },
          { field: "End date", value: c.end_date ?? "-" },
          { field: "ID", value: c.id },
        ],
        [
          { key: "field", header: "FIELD" },
          { key: "value", header: "VALUE" },
        ]
      );
    });

  cycle
    .command("create")
    .description("Create a cycle")
    .requiredOption("-p, --project <ref>", "Project identifier, name, or UUID")
    .requiredOption("--name <name>", "Cycle name")
    .option("--description <text>", "Cycle description")
    .option("--start-date <YYYY-MM-DD>", "Start date (requires --end-date)")
    .option("--end-date <YYYY-MM-DD>", "End date (requires --start-date)")
    .action(
      async (
        options: { project: string; name: string; description?: string; startDate?: string; endDate?: string },
        command: Command
      ) => {
        // Mirrors apps/api/plane/api/views/cycle.py::CycleListCreateAPIEndpoint.post's
        // own validation - surfacing this client-side avoids a round trip
        // for the single most common mistake (only one date set).
        if (Boolean(options.startDate) !== Boolean(options.endDate)) {
          throw new ValidationError("--start-date and --end-date must be provided together, or not at all.");
        }

        const ctx = buildContext(command);
        const project = await resolveProject(ctx.client, ctx.workspace, options.project);
        const { data: c } = await ctx.client.post<CycleRecord>(
          `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/cycles/`,
          {
            name: options.name,
            ...(options.description ? { description: options.description } : {}),
            ...(options.startDate ? { start_date: options.startDate, end_date: options.endDate } : {}),
          }
        );

        if (ctx.output === "json") {
          printJson(c);
          return;
        }
        process.stdout.write(`Created cycle "${c.name}" (${c.id}) in ${project.identifier}.\n`);
      }
    );
}
