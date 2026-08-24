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
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Bundle deleted", message: `"${scheme.name}" was deleted.` });
      void mutateSchemes();
    } catch (error: unknown) {
      const err = error as { error?: string; role_count?: number };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not delete bundle",
        message: err?.role_count
          ? `${err.error} (attached to ${err.role_count} role(s) - detach it first).`
          : (err?.error ?? "Something went wrong. Please try again."),
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
        <p className="text-body-xs-regular text-tertiary">
          Reusable, named sets of atomic permissions. Attach a bundle to one or more roles from the Roles tab (Workspace
          Settings &gt; Members &gt; Roles).
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => setEditorState({ open: true, scheme: undefined })}
          className="shrink-0"
        >
          Create bundle
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
                    {scheme.items.length} permission{scheme.items.length === 1 ? "" : "s"}
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
                  {scheme.is_system ? "View" : "Edit"}
                </button>
                {!scheme.is_system && (
                  <button
                    type="button"
                    onClick={() => handleDelete(scheme)}
                    className="rounded-md px-2 py-1 text-caption-md-medium text-danger-primary hover:bg-layer-1"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyStateCompact title="No bundles yet" description="Create your first reusable permission bundle." />
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
