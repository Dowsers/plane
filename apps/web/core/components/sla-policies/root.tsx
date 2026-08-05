/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Tabs } from "@plane/propel/tabs";
// local imports
import { ComplianceReportRoot } from "./compliance-report-root";
import { SLAPolicyListRoot } from "./policy-list-root";

type Props = {
  workspaceSlug: string;
};

const TAB_POLICIES = "policies";
const TAB_REPORT = "report";

/**
 * Top-level "SLA" workspace settings screen: a "Policies" tab (list +
 * create/edit/duplicate/delete/reorder) and a "Compliance report" tab
 * (filters + summary + CSV export), combined into a single settings page
 * rather than two separate routes - this avoids a second react-router
 * route/typegen entry for what is, functionally, one admin screen with two
 * views over the same underlying data (mirrors how the sibling
 * `WorkflowRuleExecutionLogPanel` is a secondary view reached from within
 * the same page rather than its own route).
 *
 * `SLAPolicy` is Admin-gated for every verb on the backend (see
 * `apps/api/plane/app/views/sla/base.py` module docstring) - the parent
 * settings page (`app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/
 * sla-policies/page.tsx`) already gates the whole route behind
 * `NotAuthorizedView`, but no additional `isAdmin` check is duplicated
 * here since, unlike `WorkflowRulesRoot`, this component has no
 * CE/EE extension-point equivalent that could mount it outside that gate.
 */
export function SLAPoliciesRoot(props: Props) {
  const { workspaceSlug } = props;
  const [activeTab, setActiveTab] = useState<string>(TAB_POLICIES);

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as string)}>
      <Tabs.List>
        <Tabs.Trigger value={TAB_POLICIES}>Policies</Tabs.Trigger>
        <Tabs.Trigger value={TAB_REPORT}>Compliance report</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value={TAB_POLICIES} className="pt-4">
        <SLAPolicyListRoot workspaceSlug={workspaceSlug} />
      </Tabs.Content>
      <Tabs.Content value={TAB_REPORT} className="pt-4">
        <ComplianceReportRoot workspaceSlug={workspaceSlug} />
      </Tabs.Content>
    </Tabs>
  );
}
