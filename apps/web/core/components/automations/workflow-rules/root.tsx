/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import useSWR, { mutate } from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button, Loader } from "@plane/ui";
import type { TWorkflowRule } from "@plane/types";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// services
import { WorkflowRuleService } from "@/services/workflow-rule.service";
// local imports
import { WorkflowRuleExecutionLogPanel } from "./execution-log-panel";
import { WorkflowRuleFormModal } from "./rule-form-modal";
import { WorkflowRuleListItem } from "./rule-list-item";

const workflowRuleService = new WorkflowRuleService();

const RULES_KEY = (workspaceSlug: string, projectId: string) => `WORKFLOW_RULES_${workspaceSlug}_${projectId}`;

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * "Custom rules" section of Project Settings > Automations - trigger ->
 * optional AND-combined conditions -> ordered actions, plus an execution
 * log viewer. See docs/feature-specs/06-automation-workflow-sla.md
 * ("Moteur de regles d'automatisation") in plane-selfhost.
 *
 * The backend (apps/api/plane/app/views/workflow_rule/base.py) is
 * ADMIN-only for every verb, including read - this whole section is
 * already behind the parent settings page's own `NotAuthorizedView` gate
 * (app/.../automations/page.tsx checks
 * `allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT)`
 * for the entire page before rendering `CustomAutomationsRoot`), but the
 * `isAdmin` check below is kept as defense-in-depth since
 * `ce/components/automations/root.tsx` is a standalone extension point
 * that isn't guaranteed to always be mounted behind that same gate.
 *
 * No mobx store here, deliberately - follows the sibling `TriageRulesRoot`
 * (apps/web/core/components/intake/triage-rules/root.tsx, the pre-existing
 * narrower rule builder for intake auto-triage) convention of plain
 * service calls + SWR rather than a dedicated store, since this data has
 * no cross-cutting consumers elsewhere in the app.
 */
export function WorkflowRulesRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);

  const [editingRule, setEditingRule] = useState<TWorkflowRule | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [logsRule, setLogsRule] = useState<TWorkflowRule | null>(null);

  const { data: rules, isLoading } = useSWR(
    isAdmin ? RULES_KEY(workspaceSlug, projectId) : null,
    isAdmin ? () => workflowRuleService.list(workspaceSlug, projectId) : null
  );

  if (!isAdmin) return null;

  const refresh = () => mutate(RULES_KEY(workspaceSlug, projectId));

  return (
    <section className="mt-7 w-full border-t border-subtle pt-7">
      <SettingsHeading
        title="Custom rules"
        description="Automatically update work items based on triggers, conditions, and actions."
        control={
          <Button
            variant="primary"
            size="sm"
            prependIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => {
              setEditingRule(null);
              setIsFormOpen(true);
            }}
          >
            New rule
          </Button>
        }
      />

      <div className="mt-4 flex flex-col gap-2">
        {isLoading && (
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="60px" />
            <Loader.Item height="60px" />
          </Loader>
        )}
        {!isLoading && (rules?.length ?? 0) === 0 && (
          <p className="text-13 text-tertiary">No custom rules configured yet.</p>
        )}
        {rules?.map((rule) => (
          <WorkflowRuleListItem
            key={rule.id}
            rule={rule}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onEdit={() => {
              setEditingRule(rule);
              setIsFormOpen(true);
            }}
            onViewLogs={() => setLogsRule(rule)}
            onChanged={refresh}
          />
        ))}
      </div>

      <WorkflowRuleFormModal
        isOpen={isFormOpen}
        handleClose={() => setIsFormOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        rule={editingRule}
        onSaved={refresh}
      />

      {logsRule && (
        <WorkflowRuleExecutionLogPanel
          isOpen={!!logsRule}
          handleClose={() => setLogsRule(null)}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          rule={logsRule}
        />
      )}
    </section>
  );
}
