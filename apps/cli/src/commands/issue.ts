// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { Command } from "commander";
import { collectList, isUuid } from "../cli-utils.js";
import { ValidationError } from "../errors.js";
import { buildIssueFilterQuery, type IssueFilterOptions } from "../issue-filters.js";
import { escapeHtml, printJson, printTable, truncate } from "../output.js";
import { confirm } from "../prompt.js";
import {
  resolveAssignee,
  resolveCycle,
  resolveLabel,
  resolveModule,
  resolveProject,
  resolveState,
} from "../resolvers.js";
import { buildContext, type CommandContext } from "./context.js";

// `expand=state` turns `state` from a raw UUID into {id, name, group, ...}
// (apps/api/plane/api/serializers/base.py's generic expansion map).
// `assignees`/`labels` go through IssueSerializer's own overridden
// to_representation instead (apps/api/plane/api/serializers/issue.py) -
// without expand they're arrays of raw UUID strings; with
// `expand=assignees,labels` they become full UserLiteSerializer/LabelSerializer
// objects. Both forms are requested below and narrowed by `isExpandedUser`/
// `isExpandedLabel`.
interface ExpandedUser {
  id: string;
  email: string;
  display_name: string;
}

interface ExpandedLabel {
  id: string;
  name: string;
}

interface IssueRecord {
  id: string;
  name: string;
  priority: string;
  sequence_id: number;
  project: string;
  state?: string | { id: string; name: string; group: string } | null;
  assignees?: (string | ExpandedUser)[];
  labels?: (string | ExpandedLabel)[];
  start_date?: string | null;
  target_date?: string | null;
}

interface ProjectLite {
  id: string;
  identifier: string;
  name: string;
}

// Exact shape built by apps/api/plane/app/views/issue/base.py::bulk_issue_operations
// (the `result` dict at the end of that function) - both buckets are
// always arrays of {id, reasons}, never a dict keyed by issue id.
interface BulkOperationResponse {
  bulk_operation_id: string;
  success: { id: string; fields: string[] }[];
  failed: { id: string; reasons: string[] }[];
  pending_approval: { id: string; reasons: string[] }[];
}

function stateLabel(state: IssueRecord["state"]): string {
  if (!state) return "-";
  return typeof state === "string" ? state : state.name;
}

function namesLabel(items: (string | ExpandedUser | ExpandedLabel)[] | undefined): string {
  if (!items || items.length === 0) return "-";
  return items
    .map((item) => (typeof item === "string" ? item : "display_name" in item ? item.display_name : item.name))
    .join(", ");
}

function issueKey(project: ProjectLite, issue: IssueRecord): string {
  return `${project.identifier}-${issue.sequence_id}`;
}

const KEY_RE = /^([a-zA-Z][a-zA-Z0-9]*)-(\d+)$/;

/**
 * Accepts either a "PROJECT-123" human key (resolved via
 * WorkspaceIssueAPIEndpoint's by-identifier route - no project id needed
 * up front) or a raw issue UUID plus --project. Shared by view/update/delete
 * so all three accept the same two reference forms.
 */
async function fetchIssueByRef(
  ctx: CommandContext,
  ref: string,
  projectRef: string | undefined
): Promise<{ issue: IssueRecord; project: ProjectLite }> {
  const keyMatch = !isUuid(ref) ? ref.match(KEY_RE) : null;
  if (keyMatch) {
    const [, identifier, sequence] = keyMatch;
    const { data: issue } = await ctx.client.get<IssueRecord>(
      `/api/v1/workspaces/${ctx.workspace}/work-items/${identifier.toUpperCase()}-${sequence}/`,
      { expand: "state,assignees,labels" }
    );
    const project = await resolveProject(ctx.client, ctx.workspace, issue.project);
    return { issue, project };
  }

  if (!isUuid(ref)) {
    throw new ValidationError(`"${ref}" is not a valid work item key (e.g. PROJ-123) or UUID.`);
  }
  if (!projectRef) {
    throw new ValidationError("Pass --project when referencing a work item by UUID.");
  }
  const project = await resolveProject(ctx.client, ctx.workspace, projectRef);
  const { data: issue } = await ctx.client.get<IssueRecord>(
    `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/work-items/${ref}/`,
    { expand: "state,assignees,labels" }
  );
  return { issue, project };
}

function filterOptionDefs(command: Command, matchPrefix = ""): Command {
  return command
    .option(
      `--${matchPrefix}state <name-or-id>`,
      "Filter: state name or UUID (repeatable/comma-separated)",
      collectList,
      []
    )
    .option(
      `--${matchPrefix}priority <value>`,
      "Filter: urgent|high|medium|low|none (repeatable/comma-separated)",
      collectList,
      []
    )
    .option(
      `--${matchPrefix}assignee <ref>`,
      'Filter: email, display name, UUID, or "me" (repeatable/comma-separated)',
      collectList,
      []
    )
    .option(
      `--${matchPrefix}label <name-or-id>`,
      "Filter: label name or UUID (repeatable/comma-separated)",
      collectList,
      []
    )
    .option(
      `--${matchPrefix}cycle <name-or-id>`,
      "Filter: cycle name or UUID (repeatable/comma-separated)",
      collectList,
      []
    )
    .option(
      `--${matchPrefix}module <name-or-id>`,
      "Filter: module name or UUID (repeatable/comma-separated)",
      collectList,
      []
    );
}

export function registerIssueCommands(program: Command): void {
  const issue = program.command("issue").description("Manage work items (issues)");

  filterOptionDefs(
    issue
      .command("list")
      .description("List work items in a project")
      .requiredOption("-p, --project <ref>", "Project identifier, name, or UUID")
  )
    .option("--limit <n>", "Page size", "50")
    .option("--all", "Fetch every page", false)
    .action(
      async (options: IssueFilterOptions & { project: string; limit: string; all: boolean }, command: Command) => {
        const ctx = buildContext(command);
        const project = await resolveProject(ctx.client, ctx.workspace, options.project);
        const query = await buildIssueFilterQuery(ctx.client, ctx.workspace, project.id, options);
        const perPage = Number(options.limit) || 50;

        const { results, truncated } = await ctx.client.paginateAll<IssueRecord>(
          `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/work-items/`,
          { ...query, expand: "state,assignees,labels" },
          { perPage, all: options.all }
        );

        if (ctx.output === "json") {
          printJson(results);
          return;
        }
        printTable(results, [
          { key: "id", header: "KEY", format: (_v, row) => issueKey(project, row) },
          { key: "name", header: "TITLE", format: (v) => truncate(String(v ?? ""), 50) },
          { key: "state", header: "STATE", format: (v) => stateLabel(v as IssueRecord["state"]) },
          { key: "priority", header: "PRIORITY" },
          {
            key: "assignees",
            header: "ASSIGNEES",
            format: (v) => truncate(namesLabel(v as IssueRecord["assignees"]), 30),
          },
        ]);
        if (truncated) process.stdout.write(`Showing first ${perPage}. Use --all to fetch every page.\n`);
      }
    );

  issue
    .command("view <ref>")
    .description('Show a work item by "PROJECT-123" key, or by UUID with --project')
    .option("-p, --project <ref>", "Project identifier, name, or UUID (required if <ref> is a UUID)")
    .action(async (ref: string, options: { project?: string }, command: Command) => {
      const ctx = buildContext(command);
      const { issue: item, project } = await fetchIssueByRef(ctx, ref, options.project);

      if (ctx.output === "json") {
        printJson(item);
        return;
      }
      const key = issueKey(project, item);
      process.stdout.write(`${key}: ${item.name}\n\n`);
      printTable(
        [
          { field: "State", value: stateLabel(item.state) },
          { field: "Priority", value: item.priority },
          { field: "Assignees", value: namesLabel(item.assignees) },
          { field: "Labels", value: namesLabel(item.labels) },
          { field: "Start date", value: item.start_date ?? "-" },
          { field: "Target date", value: item.target_date ?? "-" },
          { field: "ID", value: item.id },
        ],
        [
          { key: "field", header: "FIELD" },
          { key: "value", header: "VALUE" },
        ]
      );
    });

  issue
    .command("create")
    .description("Create a work item")
    .requiredOption("-p, --project <ref>", "Project identifier, name, or UUID")
    .requiredOption("-t, --title <title>", "Work item title")
    .option("-d, --description <text>", "Plain-text description")
    .option("--priority <value>", "urgent|high|medium|low|none")
    .option("--state <name-or-id>", "Initial state")
    .option(
      "--assignee <ref>",
      'Assignee: email, display name, UUID, or "me" (repeatable/comma-separated)',
      collectList,
      []
    )
    .action(
      async (
        options: {
          project: string;
          title: string;
          description?: string;
          priority?: string;
          state?: string;
          assignee: string[];
        },
        command: Command
      ) => {
        const ctx = buildContext(command);
        const project = await resolveProject(ctx.client, ctx.workspace, options.project);

        const body: Record<string, unknown> = { name: options.title };
        if (options.description) body.description_html = `<p>${escapeHtml(options.description)}</p>`;
        if (options.priority) body.priority = options.priority;
        if (options.state) body.state = await resolveState(ctx.client, ctx.workspace, project.id, options.state);
        if (options.assignee.length) {
          body.assignees = await Promise.all(
            options.assignee.map((a) => resolveAssignee(ctx.client, ctx.workspace, project.id, a))
          );
        }

        const { data: created } = await ctx.client.post<IssueRecord>(
          `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/work-items/`,
          body
        );

        if (ctx.output === "json") {
          printJson(created);
          return;
        }
        process.stdout.write(`Created ${issueKey(project, created)}: ${created.name} (${created.id})\n`);
      }
    );

  issue
    .command("update <ref>")
    .description('Update a work item by "PROJECT-123" key, or by UUID with --project')
    .option("-p, --project <ref>", "Project identifier, name, or UUID (required if <ref> is a UUID)")
    .option("-t, --title <title>", "New title")
    .option("-d, --description <text>", "New plain-text description")
    .option("--priority <value>", "urgent|high|medium|low|none")
    .option("--state <name-or-id>", "New state")
    .option("--assignee <ref>", "Replace assignees (repeatable/comma-separated)", collectList, [])
    .action(
      async (
        ref: string,
        options: {
          project?: string;
          title?: string;
          description?: string;
          priority?: string;
          state?: string;
          assignee: string[];
        },
        command: Command
      ) => {
        const ctx = buildContext(command);
        const { issue: current, project } = await fetchIssueByRef(ctx, ref, options.project);

        const body: Record<string, unknown> = {};
        if (options.title) body.name = options.title;
        if (options.description) body.description_html = `<p>${escapeHtml(options.description)}</p>`;
        if (options.priority) body.priority = options.priority;
        if (options.state) body.state = await resolveState(ctx.client, ctx.workspace, project.id, options.state);
        if (options.assignee.length) {
          body.assignees = await Promise.all(
            options.assignee.map((a) => resolveAssignee(ctx.client, ctx.workspace, project.id, a))
          );
        }
        if (Object.keys(body).length === 0) {
          throw new ValidationError(
            "Nothing to update - pass at least one of --title/--description/--priority/--state/--assignee."
          );
        }

        const { data: updated } = await ctx.client.patch<IssueRecord>(
          `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/work-items/${current.id}/`,
          body
        );

        if (ctx.output === "json") {
          printJson(updated);
          return;
        }
        process.stdout.write(`Updated ${issueKey(project, updated)}.\n`);
      }
    );

  issue
    .command("delete <ref>")
    .description('Delete a work item by "PROJECT-123" key, or by UUID with --project')
    .option("-p, --project <ref>", "Project identifier, name, or UUID (required if <ref> is a UUID)")
    .option("-y, --yes", "Skip the confirmation prompt", false)
    .action(async (ref: string, options: { project?: string; yes: boolean }, command: Command) => {
      const ctx = buildContext(command);
      const { issue: item, project } = await fetchIssueByRef(ctx, ref, options.project);
      const key = issueKey(project, item);

      if (!options.yes) {
        const ok = await confirm(`Delete ${key} "${item.name}"? This cannot be undone.`);
        if (!ok) {
          process.stdout.write("Aborted (pass --yes to skip this prompt).\n");
          return;
        }
      }

      await ctx.client.delete(`/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/work-items/${item.id}/`);
      if (ctx.output === "json") {
        printJson({ deleted: key, id: item.id });
        return;
      }
      process.stdout.write(`Deleted ${key}.\n`);
    });

  registerBulkUpdate(issue);
}

interface BulkUpdateOptions extends IssueFilterOptions {
  project: string;
  setState?: string;
  setPriority?: string;
  setAssignee: string[];
  setLabel: string[];
  setCycle?: string;
  setModule: string[];
  setStartDate?: string;
  setTargetDate?: string;
  setEstimatePoint?: string;
  yes: boolean;
  dryRun: boolean;
}

function registerBulkUpdate(issue: Command): void {
  filterOptionDefs(
    issue
      .command("bulk-update")
      .description("Bulk update work items matched by filters (same filters as `issue list`)")
      .requiredOption("-p, --project <ref>", "Project identifier, name, or UUID")
  )
    .option("--set-state <name-or-id>", "Set: new state")
    .option("--set-priority <value>", "Set: urgent|high|medium|low|none")
    // Assignees/labels/modules are additive server-side (bulk_issue_operations
    // keeps existing assignments and adds these), unlike the full-replace
    // semantics of `issue update`'s --assignee - see the docstring below.
    .option(
      "--set-assignee <ref>",
      "Add: assignees, kept alongside existing ones (repeatable/comma-separated)",
      collectList,
      []
    )
    .option(
      "--set-label <name-or-id>",
      "Add: labels, kept alongside existing ones (repeatable/comma-separated)",
      collectList,
      []
    )
    .option("--set-cycle <name-or-id>", "Set: move to cycle (replaces the current cycle, if any)")
    .option(
      "--set-module <name-or-id>",
      "Add: modules, kept alongside existing ones (repeatable/comma-separated)",
      collectList,
      []
    )
    .option("--set-start-date <YYYY-MM-DD>", "Set: start date")
    .option("--set-target-date <YYYY-MM-DD>", "Set: target date")
    .option("--set-estimate-point <n>", "Set: estimate point")
    .option("-y, --yes", "Skip the confirmation prompt", false)
    .option("--dry-run", "Print matched work items without writing anything", false)
    .action(async (options: BulkUpdateOptions, command: Command) => {
      const ctx = buildContext(command);
      const project = await resolveProject(ctx.client, ctx.workspace, options.project);
      const query = await buildIssueFilterQuery(ctx.client, ctx.workspace, project.id, options);

      // No artificial cap here - the 100/call limit on the bulk-operations
      // endpoint is handled by chunking below, transparently to the user.
      const { results: matches } = await ctx.client.paginateAll<IssueRecord>(
        `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/work-items/`,
        query,
        { perPage: 100, all: true }
      );

      if (matches.length === 0) {
        process.stdout.write("No work items matched the given filters.\n");
        return;
      }

      process.stdout.write(`Matched ${matches.length} work item(s):\n`);
      for (const m of matches) process.stdout.write(`  ${issueKey(project, m)}  ${m.name}\n`);

      const properties: Record<string, unknown> = {};
      if (options.setState)
        properties.state_id = await resolveState(ctx.client, ctx.workspace, project.id, options.setState);
      if (options.setPriority) properties.priority = options.setPriority;
      if (options.setAssignee.length) {
        properties.assignee_ids = await Promise.all(
          options.setAssignee.map((a) => resolveAssignee(ctx.client, ctx.workspace, project.id, a))
        );
      }
      if (options.setLabel.length) {
        properties.label_ids = await Promise.all(
          options.setLabel.map((l) => resolveLabel(ctx.client, ctx.workspace, project.id, l))
        );
      }
      if (options.setCycle)
        properties.cycle_id = await resolveCycle(ctx.client, ctx.workspace, project.id, options.setCycle);
      if (options.setModule.length) {
        properties.module_ids = await Promise.all(
          options.setModule.map((m) => resolveModule(ctx.client, ctx.workspace, project.id, m))
        );
      }
      if (options.setStartDate) properties.start_date = options.setStartDate;
      if (options.setTargetDate) properties.target_date = options.setTargetDate;
      if (options.setEstimatePoint) properties.estimate_point = Number(options.setEstimatePoint);

      if (Object.keys(properties).length === 0) {
        throw new ValidationError("Nothing to set - pass at least one --set-* flag.");
      }

      if (options.dryRun) {
        process.stdout.write("Dry run - no changes written.\n");
        return;
      }

      if (!options.yes) {
        const ok = await confirm(`Apply the above changes to ${matches.length} work item(s)?`);
        if (!ok) {
          process.stdout.write("Aborted (pass --yes to skip this prompt).\n");
          return;
        }
      }

      // apps/api/plane/api/views/issue.py::IssueBulkOperationsAPIEndpoint
      // caps a single call at 100 issues (BULK_OPERATIONS_MAX_BATCH_SIZE) -
      // chunk transparently rather than surface that limit to the user.
      const CHUNK_SIZE = 100;
      let succeeded = 0;
      const problems: string[] = [];
      // Chunks are sent one at a time, not in parallel, so a 429 on chunk
      // N backs off (via PlaneClient's own retry loop) before chunk N+1
      // ever fires - firing all chunks concurrently would defeat that.
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < matches.length; i += CHUNK_SIZE) {
        const chunk = matches.slice(i, i + CHUNK_SIZE);
        const { data } = await ctx.client.post<BulkOperationResponse>(
          `/api/v1/workspaces/${ctx.workspace}/projects/${project.id}/work-items/bulk-operations/`,
          { issue_ids: chunk.map((m) => m.id), properties }
        );
        succeeded += data.success.length;
        for (const { id, reasons } of data.failed) {
          problems.push(`${id}: failed (${reasons.join(", ")})`);
        }
        for (const { id, reasons } of data.pending_approval) {
          problems.push(`${id}: pending approval (${reasons.join(", ")})`);
        }
      }
      /* eslint-enable no-await-in-loop */

      if (ctx.output === "json") {
        printJson({ matched: matches.length, succeeded, problems });
        return;
      }
      process.stdout.write(`Updated ${succeeded}/${matches.length} work item(s).\n`);
      if (problems.length) {
        process.stdout.write(`${problems.length} not fully applied:\n`);
        for (const p of problems) process.stdout.write(`  ${p}\n`);
      }
    });
}
