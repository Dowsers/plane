/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Layers, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, Input, Loader } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";

type Props = {
  teamspaceId: string;
  canModify: boolean;
};

// Category 13, feature 3 (spec section 3) - Teamspace Views, backed by the
// dedicated `TeamspaceView` model/endpoints. Same reasoning as
// pages-tab.tsx: the existing project/workspace views-list components read
// their scope from `useParams()`/a project-bound store rather than an
// injectable id list or filter/query builder, so this is a lightweight
// standalone list (name/date, create/delete) rather than a full filter
// builder UI - creating a view here saves an empty `query`/`filters`
// placeholder that a Lead can flesh out later; there is no view-builder UI
// wired up in this iteration.
export const TeamspaceViewsTab = observer(function TeamspaceViewsTab(props: Props) {
  const { teamspaceId, canModify } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceViewsById, fetchTeamspaceViews, createTeamspaceView, deleteTeamspaceView } = useTeamspace();

  const [newViewName, setNewViewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug ? ["TEAMSPACE_VIEWS", workspaceSlug, teamspaceId] : null,
    workspaceSlug ? () => fetchTeamspaceViews(workspaceSlug.toString(), teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const views = getTeamspaceViewsById(teamspaceId);

  const handleCreate = async () => {
    if (!workspaceSlug || !newViewName.trim()) return;
    setIsCreating(true);
    try {
      await createTeamspaceView(workspaceSlug.toString(), teamspaceId, { name: newViewName.trim() });
      setNewViewName("");
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (viewId: string) => {
    if (!workspaceSlug) return;
    try {
      await deleteTeamspaceView(workspaceSlug.toString(), teamspaceId, viewId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    }
  };

  if (isLoading && views.length === 0) {
    return (
      <Loader className="flex flex-col gap-2">
        <Loader.Item height="40px" />
        <Loader.Item height="40px" />
      </Loader>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canModify && (
        <div className="flex items-center gap-2">
          <Input
            id="views-tab-new-view-name"
            name="views-tab-new-view-name"
            type="text"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            placeholder={t("teamspaces.views.new_view_placeholder")}
            className="w-full max-w-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            loading={isCreating}
            disabled={!newViewName.trim()}
          >
            {t("teamspaces.views.create")}
          </Button>
        </div>
      )}

      {views.length === 0 ? (
        <p className="py-8 text-center text-13 text-secondary">{t("teamspaces.views.empty_state")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {views.map((view) => (
            <div
              key={view.id}
              className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle p-3"
            >
              <div className="flex min-w-0 flex-grow items-center gap-2">
                <Layers className="h-4 w-4 flex-shrink-0 text-tertiary" />
                <span className="truncate text-13 font-medium">{view.name}</span>
              </div>
              <span className="flex-shrink-0 text-11 text-secondary">
                {t("teamspaces.views.updated")} {calculateTimeAgo(view.updated_at)}
              </span>
              {canModify && (
                <button type="button" onClick={() => handleDelete(view.id)} className="flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5 text-tertiary hover:text-danger-primary" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
