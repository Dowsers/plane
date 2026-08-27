/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { FileText, Lock, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, Input, Loader } from "@plane/ui";
import { calculateTimeAgo, getPageName } from "@plane/utils";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";

type Props = {
  teamspaceId: string;
  canModify: boolean;
};

// Category 13, feature 3 (spec section 3) - Teamspace Pages. The spec's UX
// note suggests reusing the project Pages list "tels quels" with scope as a
// context parameter, but `EPageStoreType`/`usePageStore` are hardcoded to
// PROJECT|WORKSPACE (see store wiring in ce/hooks/store/use-page-store.ts) -
// threading a third scope through that store, the collaborative editor
// bootstrap, and every `usePage()` call site is a much larger change than
// this iteration's surface. This is a lightweight standalone list against
// the dedicated teamspace pages endpoints instead (name/date/lock, create/
// delete) - no in-place collaborative editor view for team pages yet. See
// final report "known limitations".
export const TeamspacePagesTab = observer(function TeamspacePagesTab(props: Props) {
  const { teamspaceId, canModify } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspacePagesById, fetchTeamspacePages, createTeamspacePage, deleteTeamspacePage } = useTeamspace();

  const [newPageName, setNewPageName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug ? ["TEAMSPACE_PAGES", workspaceSlug, teamspaceId] : null,
    workspaceSlug ? () => fetchTeamspacePages(workspaceSlug.toString(), teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const pages = getTeamspacePagesById(teamspaceId);

  const handleCreate = async () => {
    if (!workspaceSlug || !newPageName.trim()) return;
    setIsCreating(true);
    try {
      await createTeamspacePage(workspaceSlug.toString(), teamspaceId, { name: newPageName.trim() });
      setNewPageName("");
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (pageId: string) => {
    if (!workspaceSlug) return;
    try {
      await deleteTeamspacePage(workspaceSlug.toString(), teamspaceId, pageId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    }
  };

  if (isLoading && pages.length === 0) {
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
            type="text"
            value={newPageName}
            onChange={(e) => setNewPageName(e.target.value)}
            placeholder={t("teamspaces.pages.new_page_placeholder")}
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
            disabled={!newPageName.trim()}
          >
            {t("teamspaces.pages.create")}
          </Button>
        </div>
      )}

      {pages.length === 0 ? (
        <p className="py-8 text-center text-13 text-secondary">{t("teamspaces.pages.empty_state")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle p-3"
            >
              <div className="flex min-w-0 flex-grow items-center gap-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-tertiary" />
                <span className="truncate text-13 font-medium">{getPageName(page.name)}</span>
                {page.is_locked && <Lock className="h-3 w-3 flex-shrink-0 text-tertiary" />}
              </div>
              <span className="flex-shrink-0 text-11 text-secondary">
                {t("teamspaces.pages.updated")} {calculateTimeAgo(page.updated_at)}
              </span>
              {canModify && (
                <button type="button" onClick={() => handleDelete(page.id)} className="flex-shrink-0">
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
