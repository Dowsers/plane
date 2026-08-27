/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, Loader, ModalCore, EModalPosition, EModalWidth } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useTeamspace } from "@/hooks/store/use-teamspace";

type Props = {
  teamspaceId: string;
  canModify: boolean;
};

export const TeamspaceProjectsTab = observer(function TeamspaceProjectsTab(props: Props) {
  const { teamspaceId, canModify } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceProjectsById, fetchTeamspaceDetails, addTeamspaceProject, removeTeamspaceProject } =
    useTeamspace();
  const { joinedProjectIds, getProjectById } = useProject();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug ? ["TEAMSPACE_PROJECTS", workspaceSlug, teamspaceId] : null,
    workspaceSlug ? () => fetchTeamspaceDetails(workspaceSlug.toString(), teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const links = getTeamspaceProjectsById(teamspaceId);
  const linkedProjectIds = new Set(links.map((link) => link.project));
  const availableProjectIds = (joinedProjectIds ?? []).filter((id) => !linkedProjectIds.has(id));

  const handleUnlink = async (teamspaceProjectId: string) => {
    // NOTE: despite the URL segment being named `<project_id>`,
    // `WorkspaceTeamspaceProjectsEndpoint.delete` (apps/api/plane/app/views/workspace/teamspace.py)
    // actually looks the row up by `TeamspaceProject.pk` - i.e. the pivot
    // row's own id (`link.id`), not the underlying project's id
    // (`link.project`). Same convention as `removeTeamspaceMember` below.
    if (!workspaceSlug) return;
    try {
      await removeTeamspaceProject(workspaceSlug.toString(), teamspaceId, teamspaceProjectId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    }
  };

  const handleLink = async () => {
    if (!workspaceSlug || selectedProjectIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await Promise.all(
        selectedProjectIds.map((projectId) =>
          addTeamspaceProject(workspaceSlug.toString(), teamspaceId, { project: projectId })
        )
      );
      setSelectedProjectIds([]);
      setIsAddModalOpen(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && links.length === 0) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="50px" />
        <Loader.Item height="50px" />
      </Loader>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canModify && (
        <div className="flex justify-end">
          <Button variant="neutral-primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
            {t("teamspaces.projects_tab.add_projects")}
          </Button>
        </div>
      )}

      {links.length === 0 ? (
        <p className="py-4 text-center text-13 text-secondary">{t("teamspaces.projects_tab.no_projects_linked")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {links.map((link) => {
            const project = getProjectById(link.project);
            return (
              <div
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle p-3"
              >
                <Link
                  href={`/${workspaceSlug}/projects/${link.project}/issues/`}
                  className="flex flex-grow items-center gap-2 truncate"
                >
                  {project && <Logo logo={project.logo_props} size={16} />}
                  <span className="truncate text-13 font-medium">{link.project_name}</span>
                  <span className="flex-shrink-0 text-11 text-secondary">{link.project_identifier}</span>
                </Link>
                {canModify && (
                  <button type="button" onClick={() => handleUnlink(link.id)} className="flex-shrink-0">
                    <X className="h-4 w-4 text-tertiary hover:text-danger-primary" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ModalCore
        isOpen={isAddModalOpen}
        handleClose={() => setIsAddModalOpen(false)}
        position={EModalPosition.CENTER}
        width={EModalWidth.LG}
      >
        <div className="flex flex-col gap-3 p-5">
          <h3 className="text-16 font-medium">{t("teamspaces.projects_tab.add_projects")}</h3>
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {availableProjectIds.length === 0 && (
              <p className="py-4 text-center text-13 text-secondary">
                {t("teamspaces.projects_tab.no_projects_available")}
              </p>
            )}
            {availableProjectIds.map((projectId) => {
              const project = getProjectById(projectId);
              if (!project) return null;
              const isSelected = selectedProjectIds.includes(projectId);
              return (
                <label
                  key={projectId}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-layer-1"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) =>
                      setSelectedProjectIds((prev) =>
                        e.target.checked ? [...prev, projectId] : prev.filter((id) => id !== projectId)
                      )
                    }
                  />
                  <Logo logo={project.logo_props} size={16} />
                  <span className="truncate text-13">{project.name}</span>
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="neutral-primary" size="sm" onClick={() => setIsAddModalOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleLink}
              loading={isSubmitting}
              disabled={selectedProjectIds.length === 0}
            >
              {t("teamspaces.projects_tab.add_projects")}
            </Button>
          </div>
        </div>
      </ModalCore>
    </div>
  );
});
