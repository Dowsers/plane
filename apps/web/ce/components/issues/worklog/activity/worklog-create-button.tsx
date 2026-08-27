/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Timer } from "lucide-react";
// plane imports
import { IconButton } from "@plane/propel/icon-button";
import { useTranslation } from "@plane/i18n";
// hooks
import { useProject } from "@/hooks/store/use-project";
// local
import { LogTimeModal } from "../create-modal";

type TIssueActivityWorklogCreateButton = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 1, "Considérations API/UX") in plane-selfhost.
 * Rendered in the activity panel header (root.tsx), gated by the
 * `isWorklogButtonEnabled` rule already written there
 * (`!isIntakeIssue && !isGuest && (isAdmin || isAssigned)`) - this
 * component only adds the project-level `is_time_tracking_enabled` check
 * (exigence 2), which that pre-existing rule didn't cover.
 */
export const IssueActivityWorklogCreateButton = observer(function IssueActivityWorklogCreateButton(
  props: TIssueActivityWorklogCreateButton
) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { getProjectById } = useProject();

  const project = getProjectById(projectId);
  if (!project?.is_time_tracking_enabled) return null;

  return (
    <>
      <IconButton
        variant="tertiary"
        icon={Timer}
        onClick={() => setIsModalOpen(true)}
        disabled={disabled}
        aria-label={t("common.worklogs")}
      />
      <LogTimeModal
        isOpen={isModalOpen}
        handleClose={() => setIsModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
      />
    </>
  );
});
