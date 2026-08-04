/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { WorkflowRulesRoot } from "@/components/automations/workflow-rules/root";

export type TCustomAutomationsRootProps = {
  projectId: string;
  workspaceSlug: string;
};

/**
 * Extension point for the project-scoped workflow rule engine ("Custom
 * rules") - see docs/feature-specs/06-automation-workflow-sla.md ("Moteur
 * de regles d'automatisation") in plane-selfhost. Rendered by the
 * Automations settings page beneath the pre-existing auto-archive/
 * auto-close/sub-issue automation section (see
 * app/.../settings/projects/[projectId]/automations/page.tsx).
 */
export function CustomAutomationsRoot(props: TCustomAutomationsRootProps) {
  const { projectId, workspaceSlug } = props;
  return <WorkflowRulesRoot projectId={projectId} workspaceSlug={workspaceSlug} />;
}
