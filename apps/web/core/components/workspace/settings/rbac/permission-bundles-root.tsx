/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPermissionScheme } from "@plane/types";
import { Loader } from "@plane/ui";
import { useTranslation } from "@plane/i18n";
// services
import workspaceRBACService from "@/services/workspace-rbac.service";
// local imports
import { BundleEditorModal } from "./bundle-editor-modal";
import { SystemBadge } from "./system-badge";

type Props = {
  workspaceSlug: string;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - Workspace Settings > Permission Bundles:
 * an independent library of reusable bundles, separate from the Roles tab
 * (exigence 2's own "un bundle... peut etre attache a plusieurs roles
 * simultanement"). System bundles (the 3 global baselines) are shown
 * first, read-only.
 */
export const PermissionBundlesRoot = observer(function PermissionBundlesRoot(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const [editorState, setEditorState] = useState<{ open: boolean; scheme: TPermissionScheme | undefined }>({
    open: false,
    scheme: undefined,
  });

  const {
    data: schemes,
    isLoading: isSchemesLoading,
    mutate: mutateSchemes,
  } = useSWR(["RBAC_SCHEMES", workspaceSlug], () => workspaceRBACService.listPermissionSchemes(workspaceSlug));
  const { data: catalogue, isLoading: isCatalogueLoading } = useSWR(["RBAC_CATALOGUE", workspaceSlug], () =>
    workspaceRBACService.getPermissionCatalogue(workspaceSlug)
  );

  const handleDelete = async (scheme: TPermissionScheme) => {
    try {
      await workspaceRBACService.deletePermissionScheme(workspaceSlug, scheme.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("permission_bundles.panel.toast.deleted_title"),
        message: t("permission_bundles.panel.toast.deleted_message", { name: scheme.name }),
      });
      void mutateSchemes();
    } catch (error: unknown) {
      const err = error as { error?: string; role_count?: number };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("permission_bundles.panel.toast.delete_failed_title"),
        message: err?.role_count
          ? t("permission_bundles.panel.toast.delete_failed_attached_message", {
              error: err.error,
              count: err.role_count,
            })
          : (err?.error ?? t("something_went_wrong_please_try_again")),
      });
    }
  };

  if (isSchemesLoading || isCatalogueLoading || !catalogue) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="56px" />
        <Loader.Item height="56px" />
        <Loader.Item height="56px" />
      </Loader>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-body-xs-regular text-tertiary">{t("permission_bundles.panel.description")}</p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => setEditorState({ open: true, scheme: undefined })}
          className="shrink-0"
        >
          {t("permission_bundles.panel.create_bundle")}
        </Button>
      </div>

      {schemes && schemes.length > 0 ? (
        <div className="flex flex-col divide-y divide-subtle">
          {schemes.map((scheme) => (
            <div key={scheme.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-body-sm-medium text-primary">{scheme.name}</h4>
                  {scheme.is_system && <SystemBadge />}
                  <Pill variant={EPillVariant.DEFAULT} size={EPillSize.SM}>
                    {t("permission_bundles.panel.permission_count", { count: scheme.items.length })}
                  </Pill>
                </div>
                {scheme.description && <p className="text-caption-md-regular text-tertiary">{scheme.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditorState({ open: true, scheme })}
                  className="rounded-md px-2 py-1 text-caption-md-medium text-secondary hover:bg-layer-1"
                >
                  {scheme.is_system ? t("common.view") : t("edit")}
                </button>
                {!scheme.is_system && (
                  <button
                    type="button"
                    onClick={() => handleDelete(scheme)}
                    className="rounded-md px-2 py-1 text-caption-md-medium text-danger-primary hover:bg-layer-1"
                  >
                    {t("delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyStateCompact
          title={t("permission_bundles.panel.empty.title")}
          description={t("permission_bundles.panel.empty.description")}
        />
      )}

      <BundleEditorModal
        workspaceSlug={workspaceSlug}
        catalogue={catalogue}
        scheme={editorState.scheme}
        isOpen={editorState.open}
        onClose={() => setEditorState({ open: false, scheme: undefined })}
        onSaved={() => void mutateSchemes()}
      />
    </div>
  );
});
