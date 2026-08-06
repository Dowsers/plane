/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Tabs } from "@plane/propel/tabs";
// local imports
import { WorkflowTransitionAuditLogRoot } from "./audit-log-root";
import { WorkflowTransitionListRoot } from "./transition-list-root";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const TAB_TRANSITIONS = "transitions";
const TAB_AUDIT_LOG = "audit-log";

/**
 * Top-level "Workflows" project settings screen - see
 * docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
 * multi-etats avec approbations", section 4) in plane-selfhost. A
 * "Transitions" tab (the graph-edge config screen: create/edit/delete, each
 * with approvers/conditions/actions) and an "Audit log" tab (every evaluated
 * attempt), combined into one settings page rather than two routes -
 * mirrors the sibling `SLAPoliciesRoot`'s own "Policies" + "Compliance
 * report" combination for the identical reason: one admin screen, two views
 * over the same underlying governance data.
 *
 * `WorkflowTransitionViewSet`/`WorkflowTransitionAuditLogEndpoint` are
 * Admin-only for every verb on the backend - the parent settings page
 * (app/.../governed-workflows/page.tsx) already gates the whole route
 * behind `NotAuthorizedView`, so no additional check is duplicated here.
 */
export function GovernedWorkflowsRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const [activeTab, setActiveTab] = useState<string>(TAB_TRANSITIONS);

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as string)}>
      <Tabs.List>
        <Tabs.Trigger value={TAB_TRANSITIONS}>Transitions</Tabs.Trigger>
        <Tabs.Trigger value={TAB_AUDIT_LOG}>Audit log</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value={TAB_TRANSITIONS} className="pt-4">
        <WorkflowTransitionListRoot workspaceSlug={workspaceSlug} projectId={projectId} />
      </Tabs.Content>
      <Tabs.Content value={TAB_AUDIT_LOG} className="pt-4">
        <WorkflowTransitionAuditLogRoot workspaceSlug={workspaceSlug} projectId={projectId} />
      </Tabs.Content>
    </Tabs>
  );
}
