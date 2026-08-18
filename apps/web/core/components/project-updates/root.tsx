/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectUpdateAIDraftResponse } from "@plane/types";
import { Avatar, Button, ContentWrapper, Loader } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectUpdate } from "@/hooks/store/use-project-update";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { ProjectUpdateService } from "@/services/project-update.service";
// local imports
import { ProjectUpdateAIBadge } from "./ai-badge";
import { ProjectUpdateAIGenerationLogModal } from "./ai-generation-log-modal";
import { CreateProjectUpdateModal } from "./create-update-modal";
import { ProjectUpdateStatusBadge } from "./status-badge";

const projectUpdateService = new ProjectUpdateService();

export const ProjectUpdatesListRoot = observer(function ProjectUpdatesListRoot() {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  const { currentWorkspace } = useWorkspace();
  const { getProjectUpdateIds, getUpdateById, fetchUpdates } = useProjectUpdate();

  const [createModal, setCreateModal] = useState(false);
  const [auditLogModal, setAuditLogModal] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  // Seeds the create-update modal with an already-generated AI draft - see
  // `CreateProjectUpdateModal`'s own `initialDraft` prop docstring. Reset to
  // `null` whenever the modal is closed so a subsequent plain "Add update"
  // click never accidentally carries a stale draft along.
  const [aiDraft, setAiDraft] = useState<TProjectUpdateAIDraftResponse | null>(null);

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

  const isProjectAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  // Exigence 2/3 - visible only for Member/Admin (same as manual creation)
  // AND only once an admin has explicitly enabled the workspace toggle.
  const canGenerateDraft = canCreate && !!currentWorkspace?.is_ai_update_draft_enabled;

  const updateIds = projectId ? getProjectUpdateIds(projectId.toString()) : null;
  const isOverdue =
    !!currentProjectDetails?.next_update_due_at && new Date(currentProjectDetails.next_update_due_at) < new Date();

  const handleCloseCreateModal = () => {
    setCreateModal(false);
    setAiDraft(null);
  };

  const handleOpenManualCreateModal = () => {
    setAiDraft(null);
    setCreateModal(true);
  };

  // Exigence 10 - on any failure (400/503/429) this always still opens the
  // create-update modal, just without a draft to pre-fill - a generation
  // error must never block the plain manual "Add update" flow.
  const handleGenerateDraft = async () => {
    if (!workspaceSlug || !projectId) return;
    setIsGeneratingDraft(true);
    try {
      const result = await projectUpdateService.generateDraft(workspaceSlug.toString(), projectId.toString());
      setAiDraft(result);
      setCreateModal(true);
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: err?.error ?? t("project_updates.ai_draft.error"),
      });
      setAiDraft(null);
      setCreateModal(true);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

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
      <CreateProjectUpdateModal isOpen={createModal} handleClose={handleCloseCreateModal} initialDraft={aiDraft} />
      {isProjectAdmin && (
        <ProjectUpdateAIGenerationLogModal
          isOpen={auditLogModal}
          handleClose={() => setAuditLogModal(false)}
          workspaceSlug={workspaceSlug?.toString() ?? ""}
          projectId={projectId?.toString() ?? ""}
        />
      )}
      {isOverdue && (
        <div className="mb-4 rounded-md bg-warning-subtle px-3 py-2 text-13 text-warning-primary">
          {t("project_updates.overdue_banner")}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pb-4">
        {isProjectAdmin ? (
          <button
            type="button"
            className="text-12 text-tertiary hover:text-secondary hover:underline"
            onClick={() => setAuditLogModal(true)}
          >
            {t("project_updates.audit_log.view_link")}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {canGenerateDraft && (
            <Button
              variant="neutral-primary"
              size="sm"
              prependIcon={<Sparkles className="size-3.5" aria-hidden="true" />}
              onClick={handleGenerateDraft}
              loading={isGeneratingDraft}
            >
              {t("project_updates.generate_draft")}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={handleOpenManualCreateModal} disabled={!canCreate}>
            {t("project_updates.post_update")}
          </Button>
        </div>
      </div>

      {isGeneratingDraft && (
        <div className="mb-4 flex flex-col gap-3 rounded-md border-[0.5px] border-subtle p-4">
          <div className="flex items-center gap-2 text-13 text-secondary">
            <Sparkles className="size-4 animate-pulse text-tertiary" aria-hidden="true" />
            <span>{t("project_updates.ai_draft.generating")}</span>
          </div>
          <Loader className="flex flex-col gap-2">
            <Loader.Item height="14px" width="90%" />
            <Loader.Item height="14px" width="75%" />
            <Loader.Item height="14px" width="60%" />
          </Loader>
        </div>
      )}

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
                    {projectUpdate.is_ai_assisted && (
                      <ProjectUpdateAIBadge
                        createdAt={projectUpdate.created_at}
                        generationMetadata={projectUpdate.ai_generation_metadata}
                      />
                    )}
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
