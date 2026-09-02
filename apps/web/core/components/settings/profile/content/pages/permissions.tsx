/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import type { TMyEffectivePermission, TPermissionCategory } from "@plane/types";
import { CustomSelect, Loader } from "@plane/ui";
// components
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";
import { ConditionBadgeList } from "@/components/workspace/settings/rbac/condition-badge";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserSettings } from "@/hooks/store/user";
// services
import workspaceRBACService from "@/services/workspace-rbac.service";

const useCategoryLabels = (): Record<TPermissionCategory, string> => {
  const { t } = useTranslation();
  return {
    ISSUE: t("common.work_items"),
    CYCLE: t("common.cycles"),
    MODULE: t("common.modules"),
    PAGE: t("common.page"),
    VIEW: t("account_settings.permissions_page.category_views"),
    WORKSPACE: t("common.workspace"),
  };
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4, user story 5 - "En tant que membre du
 * workspace, je veux voir dans les parametres de mon profil un resume
 * lisible de ce que mon role m'autorise a faire". Lives under account-
 * level Profile Settings (`/settings/profile/permissions`, no
 * `:workspaceSlug` in the URL) rather than a workspace-scoped route -
 * `useWorkspace().currentWorkspace` is derived from the URL's own
 * `workspaceSlug` param (apps/web/core/store/workspace/index.ts) and is
 * always `null` here, so this page needs its OWN workspace picker,
 * defaulting to the user's last-active workspace.
 */
export const PermissionsProfileSettings = observer(function PermissionsProfileSettings() {
  // i18n
  const { t } = useTranslation();
  const CATEGORY_LABELS = useCategoryLabels();
  // store hooks
  const { workspaces } = useWorkspace();
  const { data: userSettings } = useUserSettings();
  // state
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const workspaceList = useMemo(() => Object.values(workspaces ?? {}), [workspaces]);

  useEffect(() => {
    if (selectedSlug || workspaceList.length === 0) return;
    const preferredSlug =
      userSettings?.workspace?.last_workspace_slug ?? userSettings?.workspace?.fallback_workspace_slug;
    const preferredWorkspace = workspaceList.find((workspace) => workspace.slug === preferredSlug);
    setSelectedSlug(preferredWorkspace?.slug ?? workspaceList[0].slug);
  }, [workspaceList, userSettings, selectedSlug]);

  const { data, isLoading } = useSWR(
    selectedSlug ? ["RBAC_MY_PERMISSIONS", selectedSlug] : null,
    () => workspaceRBACService.getMyEffectivePermissions(selectedSlug as string),
    { revalidateOnFocus: false }
  );

  const groupedByCategory = useMemo(() => {
    const grouped: Partial<Record<TPermissionCategory, TMyEffectivePermission[]>> = {};
    (data?.permissions ?? []).forEach((permission) => {
      const bucket = grouped[permission.category] ?? [];
      bucket.push(permission);
      grouped[permission.category] = bucket;
    });
    return grouped;
  }, [data]);

  return (
    <div className="size-full">
      <ProfileSettingsHeading
        title={t("account_settings.actions.permissions")}
        description={t("account_settings.permissions_page.description")}
      />

      {workspaceList.length > 1 && selectedSlug && (
        <div className="mt-6 flex items-center gap-2">
          <span className="text-body-xs-medium text-secondary">{t("common.workspace")}</span>
          <CustomSelect
            value={selectedSlug}
            onChange={(value: string) => setSelectedSlug(value)}
            label={workspaceList.find((workspace) => workspace.slug === selectedSlug)?.name}
            buttonClassName="border border-subtle bg-layer-2"
          >
            {workspaceList.map((workspace) => (
              <CustomSelect.Option key={workspace.id} value={workspace.slug}>
                {workspace.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>
      )}

      {!selectedSlug || isLoading || !data ? (
        <Loader className="mt-6 flex flex-col gap-3">
          <Loader.Item height="24px" />
          <Loader.Item height="64px" />
          <Loader.Item height="64px" />
        </Loader>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <span className="text-body-xs-medium text-secondary">
              {t("account_settings.permissions_page.your_role")}
            </span>
            <Pill variant={EPillVariant.PRIMARY} size={EPillSize.SM}>
              {data.role?.name ?? t("account_settings.permissions_page.unknown_role")}
            </Pill>
          </div>

          {data.permissions.length === 0 ? (
            <p className="text-body-xs-regular text-tertiary">{t("account_settings.permissions_page.empty_state")}</p>
          ) : (
            (Object.keys(groupedByCategory) as TPermissionCategory[]).map((category) => (
              <div key={category} className="flex flex-col gap-2">
                <h4 className="text-caption-md-medium text-tertiary">{CATEGORY_LABELS[category]}</h4>
                <div className="flex flex-col gap-1.5 rounded-md border border-subtle bg-layer-1 p-3">
                  {groupedByCategory[category]?.map((permission) => (
                    <div key={permission.key} className="flex items-center justify-between gap-3">
                      <span className="text-body-xs-regular text-secondary">{permission.label}</span>
                      <ConditionBadgeList conditions={permission.conditions} />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
});
