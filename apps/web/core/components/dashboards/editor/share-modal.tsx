/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { SPACE_BASE_PATH, SPACE_BASE_URL } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CopyLinkIcon, GlobeIcon, NewTabIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDashboard } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// hooks
import { useCustomDashboard } from "@/hooks/store/use-custom-dashboard";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  dashboard: TDashboard;
};

/**
 * Publish/unpublish + share-link modal for a dashboard. Mirrors
 * `PublishProjectModal` (`apps/web/core/components/project/publish-project/
 * modal.tsx`) - the existing "copy public link" UI for the project-publish
 * flow - for both the public-URL construction (`SPACE_BASE_URL`/
 * `SPACE_BASE_PATH` from `@plane/constants`, falling back to
 * `window.location.origin` when `SPACE_BASE_URL` is unset, exactly as that
 * modal does) and the overall publish/unpublish/regenerate button layout.
 */
export const DashboardShareModal = observer(function DashboardShareModal(props: Props) {
  const { isOpen, handleClose, dashboard } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { publishDashboard, regenerateDashboardPublishLink, unpublishDashboard } = useCustomDashboard();

  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const isPublished = dashboard.is_published && !!dashboard.anchor;

  const spaceAppUrl = (SPACE_BASE_URL.trim() === "" ? window.location.origin : SPACE_BASE_URL) + SPACE_BASE_PATH;
  const publishLink = `${spaceAppUrl}/dashboards/${dashboard.anchor}`;

  const handlePublish = async () => {
    if (!workspaceSlug) return;
    setIsPublishing(true);
    try {
      await publishDashboard(workspaceSlug.toString(), dashboard.id);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("workspace_dashboards.toast.error") });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!workspaceSlug) return;
    setIsUnpublishing(true);
    try {
      await unpublishDashboard(workspaceSlug.toString(), dashboard.id);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("workspace_dashboards.toast.error") });
    } finally {
      setIsUnpublishing(false);
    }
  };

  const handleRegenerate = async () => {
    if (!workspaceSlug) return;
    setIsRegenerating(true);
    try {
      await regenerateDashboardPublishLink(workspaceSlug.toString(), dashboard.id);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("workspace_dashboards.toast.error") });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopyLink = () =>
    copyTextToClipboard(publishLink).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: "", message: t("workspace_dashboards.share.link_copied") })
    );

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <h5 className="text-18 font-medium text-secondary">{t("workspace_dashboards.share.title")}</h5>
        <p className="text-13 text-secondary">{t("workspace_dashboards.share.description")}</p>

        {isPublished ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-md border border-strong py-1.5 pr-1 pl-4">
              <a
                href={publishLink}
                className="truncate text-13 text-secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                {publishLink}
              </a>
              <div className="flex flex-shrink-0 items-center gap-1">
                <a
                  href={publishLink}
                  className="grid size-8 place-items-center rounded-sm bg-layer-3 hover:bg-layer-3-hover"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <NewTabIcon className="size-4" />
                </a>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1 rounded-sm bg-layer-3 px-3 py-2 text-11 font-medium hover:bg-layer-3-hover"
                  onClick={handleCopyLink}
                >
                  <CopyLinkIcon className="size-3" />
                  {t("workspace_dashboards.share.copy_link")}
                </button>
              </div>
            </div>
            <p className="flex items-center gap-1 text-13 font-medium text-accent-primary">
              <span className="relative grid size-2.5 place-items-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-primary opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent-primary" />
              </span>
              {t("workspace_dashboards.share.published_banner")}
            </p>
          </>
        ) : (
          <p className="text-13 text-secondary">{t("workspace_dashboards.share.not_published")}</p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-subtle pt-4">
          <div className="flex items-center gap-1 text-13 text-placeholder">
            <GlobeIcon className="size-3.5" />
            <span>{t("workspace_dashboards.share.description")}</span>
          </div>
          <div className="flex items-center gap-2">
            {isPublished && (
              <Button variant="secondary" size="sm" onClick={handleRegenerate} loading={isRegenerating}>
                {isRegenerating
                  ? t("workspace_dashboards.share.regenerating_link")
                  : t("workspace_dashboards.share.regenerate_link")}
              </Button>
            )}
            {isPublished ? (
              <Button variant="error-fill" size="sm" onClick={handleUnpublish} loading={isUnpublishing}>
                {isUnpublishing
                  ? t("workspace_dashboards.share.unpublishing")
                  : t("workspace_dashboards.share.unpublish")}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={handlePublish} loading={isPublishing}>
                {isPublishing ? t("workspace_dashboards.share.publishing") : t("workspace_dashboards.share.publish")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </ModalCore>
  );
});
