/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Avatar, Button, ContentWrapper, Loader } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectUpdate } from "@/hooks/store/use-project-update";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateProjectUpdateModal } from "./create-update-modal";
import { ProjectUpdateStatusBadge } from "./status-badge";

export const ProjectUpdatesListRoot = observer(function ProjectUpdatesListRoot() {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  const { getProjectUpdateIds, getUpdateById, fetchUpdates } = useProjectUpdate();

  const [createModal, setCreateModal] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug && projectId ? ["PROJECT_UPDATES", workspaceSlug, projectId] : null,
    workspaceSlug && projectId ? () => fetchUpdates(workspaceSlug.toString(), projectId.toString()) : null,
    { revalidateOnFocus: false }
  );

  const canCreate =
    allowPermissions(
      [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
      EUserPermissionsLevel.PROJECT,
      workspaceSlug?.toString(),
      projectId?.toString()
    ) && !currentProjectDetails?.archived_at;

  const updateIds = projectId ? getProjectUpdateIds(projectId.toString()) : null;
  const isOverdue =
    !!currentProjectDetails?.next_update_due_at && new Date(currentProjectDetails.next_update_due_at) < new Date();

  if (isLoading && !updateIds) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
        </Loader>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <CreateProjectUpdateModal isOpen={createModal} handleClose={() => setCreateModal(false)} />
      {isOverdue && (
        <div className="mb-4 rounded-md bg-warning-subtle px-3 py-2 text-13 text-warning-primary">
          {t("project_updates.overdue_banner")}
        </div>
      )}
      <div className="flex items-center justify-end pb-4">
        <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
          {t("project_updates.post_update")}
        </Button>
      </div>

      {!updateIds || updateIds.length === 0 ? (
        <p className="py-10 text-center text-13 text-secondary">{t("project_updates.no_updates_yet")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {updateIds.map((updateId) => {
            const projectUpdate = getUpdateById(updateId);
            if (!projectUpdate) return null;
            return (
              <div key={updateId} className="flex flex-col gap-2 rounded-md border-[0.5px] border-subtle p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar
                      size="sm"
                      name={projectUpdate.created_by_detail?.display_name}
                      src={projectUpdate.created_by_detail?.avatar_url}
                    />
                    <span className="text-13 font-medium">{projectUpdate.created_by_detail?.display_name}</span>
                    <span className="text-11 text-tertiary">{calculateTimeAgo(projectUpdate.created_at)}</span>
                  </div>
                  <ProjectUpdateStatusBadge status={projectUpdate.status} />
                </div>
                <p className="text-13 whitespace-pre-line text-secondary">{projectUpdate.description_html}</p>
              </div>
            );
          })}
        </div>
      )}
    </ContentWrapper>
  );
});
