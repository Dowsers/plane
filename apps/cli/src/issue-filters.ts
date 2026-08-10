// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.
//
// Shared by `issue list` and `issue bulk-update` (which matches its
// target set with the exact same filters before writing) - see
// apps/api/plane/utils/issue_filters.py for the authoritative query
// param names this maps onto (state/priority/assignees/labels/cycle/module,
// comma-separated UUID lists except `priority`, which is a raw enum).

import type { PlaneClient } from "./client.js";
import { resolveAssignee, resolveCycle, resolveLabel, resolveModule, resolveState } from "./resolvers.js";

export interface IssueFilterOptions {
  state: string[];
  priority: string[];
  assignee: string[];
  label: string[];
  cycle: string[];
  module: string[];
}

export async function buildIssueFilterQuery(
  client: PlaneClient,
  workspace: string,
  projectId: string,
  options: IssueFilterOptions
): Promise<Record<string, string>> {
  const query: Record<string, string> = {};

  if (options.state.length) {
    const ids = await Promise.all(options.state.map((s) => resolveState(client, workspace, projectId, s)));
    query.state = ids.join(",");
  }
  if (options.priority.length) {
    query.priority = options.priority.join(",");
  }
  if (options.assignee.length) {
    const ids = await Promise.all(options.assignee.map((a) => resolveAssignee(client, workspace, projectId, a)));
    query.assignees = ids.join(",");
  }
  if (options.label.length) {
    const ids = await Promise.all(options.label.map((l) => resolveLabel(client, workspace, projectId, l)));
    query.labels = ids.join(",");
  }
  if (options.cycle.length) {
    const ids = await Promise.all(options.cycle.map((c) => resolveCycle(client, workspace, projectId, c)));
    query.cycle = ids.join(",");
  }
  if (options.module.length) {
    const ids = await Promise.all(options.module.map((m) => resolveModule(client, workspace, projectId, m)));
    query.module = ids.join(",");
  }

  return query;
}
