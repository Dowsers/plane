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
import { Button, LinearProgressIndicator, Loader, ModalCore, EModalPosition, EModalWidth } from "@plane/ui";
// hooks
import { useInitiative } from "@/hooks/store/use-initiative";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  initiativeId: string;
  canModify: boolean;
};

export const InitiativeProjectsTab = observer(function InitiativeProjectsTab(props: Props) {
  const { initiativeId, canModify } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getInitiativeProjectsById, fetchInitiativeProjects, linkProjectsToInitiative, unlinkProjectFromInitiative } =
    useInitiative();
  const { joinedProjectIds, getProjectById } = useProject();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const { isLoading } = useSWR(
    workspaceSlug ? ["INITIATIVE_PROJECTS", workspaceSlug, initiativeId] : null,
    workspaceSlug ? () => fetchInitiativeProjects(workspaceSlug.toString(), initiativeId) : null,
    { revalidateOnFocus: false }
  );

  const links = getInitiativeProjectsById(initiativeId);
  const linkedProjectIds = new Set(links.map((link) => link.project_id));
  const availableProjectIds = (joinedProjectIds ?? []).filter((id) => !linkedProjectIds.has(id));

  const handleUnlink = async (projectId: string) => {
    if (!workspaceSlug) return;
    try {
      await unlinkProjectFromInitiative(workspaceSlug.toString(), initiativeId, projectId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("initiatives.toast.error") });
    }
  };

  const handleLink = async () => {
    if (!workspaceSlug || selectedProjectIds.length === 0) return;
    try {
      await linkProjectsToInitiative(workspaceSlug.toString(), initiativeId, selectedProjectIds);
      setSelectedProjectIds([]);
      setIsAddModalOpen(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("initiatives.toast.error") });
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
            {t("initiatives.add_projects")}
          </Button>
        </div>
      )}

      {links.length === 0 ? (
        <p className="py-4 text-center text-13 text-secondary">{t("initiatives.no_projects_linked")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {links.map((link) => {
            return (
              <div
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle p-3"
              >
                <Link
                  href={`/${workspaceSlug}/projects/${link.project_id}/issues/`}
                  className="flex flex-grow items-center gap-2 truncate"
                >
                  <Logo logo={link.project_detail.logo_props} size={16} />
                  <span className="truncate text-13 font-medium">{link.project_detail.name}</span>
                </Link>
                <div className="w-32 flex-shrink-0">
                  {link.total_issues > 0 && (
                    <LinearProgressIndicator
                      size="sm"
                      data={[
                        { id: "completed", name: t("common.done"), value: link.completed_issues, color: "#16A34A" },
                        {
                          id: "remaining",
                          name: t("common.pending"),
                          value: link.total_issues - link.completed_issues,
                          color: "#A3A3A3",
                        },
                      ]}
                    />
                  )}
                </div>
                {canModify && (
                  <button type="button" onClick={() => handleUnlink(link.project_id)} className="flex-shrink-0">
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
          <h3 className="text-16 font-medium">{t("initiatives.add_projects")}</h3>
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
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
                    id={`initiative-project-${projectId}`}
                    name={`initiative-project-${projectId}`}
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
            <Button variant="primary" size="sm" onClick={handleLink} disabled={selectedProjectIds.length === 0}>
              {t("initiatives.add_projects")}
            </Button>
          </div>
        </div>
      </ModalCore>
    </div>
  );
});
