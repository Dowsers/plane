/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, PROJECT_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
// components
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// local imports
import { ArchiveRestoreProjectModal } from "../archive-restore-modal";
import { DeleteProjectModal } from "../delete-project-modal";
import { SaveProjectAsTemplateModal } from "../save-as-template-modal";

type Props = {
  projectId: string;
};

export const GeneralProjectSettingsControlSection = observer(function GeneralProjectSettingsControlSection(
  props: Props
) {
  const { projectId } = props;
  // states
  const [selectProject, setSelectedProject] = useState<string | null>(null);
  const [archiveProject, setArchiveProject] = useState<boolean>(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState<boolean>(false);
  // params
  const { workspaceSlug } = useParams();
  // store hooks
  const { currentProjectDetails } = useProject();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const {
    project: { getProjectMemberDetails },
  } = useMember();
  // translation
  const { t } = useTranslation();

  if (!currentProjectDetails) return null;

  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 5, exigence 9/10 - this whole section is
  // already gated Admin-only at the project level one call site up
  // (`ProjectSettingsPage`), and a Project Owner is ALWAYS also a project
  // Admin (role 20 is a precondition to being granted Owner, see
  // `guard_against_ineligible_owner_grant`,
  // apps/api/plane/utils/project_owner.py) - so every visitor here already
  // has delete/archive rights either as plain project Admin (unchanged,
  // pre-existing behavior - `ProjectViewSet.destroy`,
  // apps/api/plane/app/views/project/base.py, was NOT tightened by the
  // category 11 backend commit) or as Project Owner. `isProjectOwner`
  // below is tracked explicitly (rather than folded into the parent's
  // `isAdmin` check) purely so the tooltip copy can name the real reason
  // whenever it applies, not to gate visibility - there is no real-world
  // case today where someone reaches this component without one of these
  // two statuses.
  const isProjectOwner = Boolean(currentUser && getProjectMemberDetails(currentUser.id, projectId)?.is_owner);
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);
  const restrictionTooltip = "Reserved for the Project Owner or a workspace Admin.";

  return (
    <div className="mt-10">
      {workspaceSlug && (
        <ArchiveRestoreProjectModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isOpen={archiveProject}
          onClose={() => setArchiveProject(false)}
          archive
        />
      )}
      <DeleteProjectModal
        project={currentProjectDetails}
        isOpen={Boolean(selectProject)}
        onClose={() => setSelectedProject(null)}
      />
      {workspaceSlug && (
        <SaveProjectAsTemplateModal
          isOpen={saveAsTemplate}
          handleClose={() => setSaveAsTemplate(false)}
          workspaceSlug={workspaceSlug.toString()}
          projectId={projectId}
          projectName={currentProjectDetails.name}
        />
      )}
      <div className="rounded-lg border border-subtle bg-layer-2">
        <SettingsBoxedControlItem
          className="rounded-b-none border-0 border-b"
          title={t("project_templates.save_as_template")}
          description="Capture this project's states, labels, and members as a reusable template for future projects."
          control={
            <Button variant="secondary" onClick={() => setSaveAsTemplate(true)}>
              {t("project_templates.save_as_template")}
            </Button>
          }
        />
        {/* Project Selector */}
        <SettingsBoxedControlItem
          className="rounded-none border-0 border-b"
          title={t("archive")}
          description="Archiving a project will unlist your project from your side navigation although you will still be able to access it from your projects page. You can restore the project or delete it whenever you want."
          control={
            <Button variant="secondary" onClick={() => setArchiveProject(true)}>
              {t("archive")}
            </Button>
          }
        />
        {/* Format Selector */}
        <SettingsBoxedControlItem
          className="rounded-t-none border-0"
          title={
            <span className="flex items-center gap-1.5">
              {t("delete")}
              <Tooltip
                tooltipContent={
                  isProjectOwner
                    ? "You can delete this project as its Project Owner."
                    : isWorkspaceAdmin
                      ? "You can delete this project as a workspace Admin."
                      : restrictionTooltip
                }
              >
                <span className="text-caption-sm-regular text-tertiary">?</span>
              </Tooltip>
            </span>
          }
          description="When deleting a project, all of the data and resources within that project will be permanently removed and cannot be recovered."
          control={
            <Button
              variant="error-outline"
              onClick={() => setSelectedProject(currentProjectDetails.id ?? null)}
              data-ph-element={PROJECT_TRACKER_ELEMENTS.DELETE_PROJECT_BUTTON}
            >
              {t("delete")}
            </Button>
          }
        />
      </div>
    </div>
  );
});
