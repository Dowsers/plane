/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPermissionCatalogue, TPermissionCategory, TPermissionCondition, TPermissionScheme } from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// services
import workspaceRBACService from "@/services/workspace-rbac.service";
// local imports
import { SystemBadge } from "./system-badge";

type Props = {
  workspaceSlug: string;
  catalogue: TPermissionCatalogue;
  /** `undefined` means "create new bundle"; a real scheme means "edit". */
  scheme: TPermissionScheme | undefined;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (scheme: TPermissionScheme) => void;
};

const useConditionLabels = (): Record<TPermissionCondition, string> => {
  const { t } = useTranslation();
  return {
    NONE: t("rbac.condition.none"),
    CREATOR_ONLY: t("rbac.condition.creator_only"),
    PROJECT_LEAD_ONLY: t("rbac.condition.project_lead_only"),
  };
};

const useCategoryLabels = (): Record<TPermissionCategory, string> => {
  const { t } = useTranslation();
  return {
    ISSUE: t("common.work_items"),
    CYCLE: t("common.cycles"),
    MODULE: t("common.modules"),
    PAGE: t("common.page"),
    VIEW: t("account_settings.permissions_page.category_views"),
    WORKSPACE: t("rbac.bundle_editor.category_workspace"),
  };
};

type TDraftRow = { included: boolean; condition: TPermissionCondition };

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - Permission Bundles screen's create/edit
 * modal: the full read-only catalogue grouped by category (exigence 1),
 * one row per permission with an include checkbox + a per-row condition
 * selector disabled unless the permission's own `supported_conditions`
 * allows a choice beyond `"NONE"` (exigence 8 - never silently accept a
 * condition the backend will reject at write time). A system bundle
 * (`is_system`/`workspace === null`) opens in read-only mode - the backend
 * itself rejects any PATCH to one (`PermissionSchemeViewSet.partial_update`).
 */
export function BundleEditorModal(props: Props) {
  const { workspaceSlug, catalogue, scheme, isOpen, onClose, onSaved } = props;
  const { t } = useTranslation();
  const CONDITION_LABELS = useConditionLabels();
  const CATEGORY_LABELS = useCategoryLabels();
  const isReadOnly = Boolean(scheme?.is_system || scheme?.workspace === null);
  const [name, setName] = useState(scheme?.name ?? "");
  const [description, setDescription] = useState(scheme?.description ?? "");
  const [rows, setRows] = useState<Record<string, TDraftRow>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(scheme?.name ?? "");
    setDescription(scheme?.description ?? "");
    const initial: Record<string, TDraftRow> = {};
    const existingByPermissionId = new Map((scheme?.items ?? []).map((item) => [item.permission.id, item]));
    Object.values(catalogue)
      .flat()
      .forEach((permission) => {
        const existing = existingByPermissionId.get(permission.id);
        initial[permission.id] = existing
          ? { included: true, condition: existing.condition }
          : { included: false, condition: "NONE" };
      });
    setRows(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scheme?.id]);

  const toggleIncluded = (permissionId: string) => {
    if (isReadOnly) return;
    setRows((prev) => ({
      ...prev,
      [permissionId]: { ...prev[permissionId], included: !prev[permissionId]?.included },
    }));
  };

  const setCondition = (permissionId: string, condition: TPermissionCondition) => {
    if (isReadOnly) return;
    setRows((prev) => ({ ...prev, [permissionId]: { ...prev[permissionId], condition } }));
  };

  const handleSubmit = async () => {
    if (!name.trim() || isReadOnly) return;
    const items = Object.entries(rows)
      .filter(([, row]) => row.included)
      .map(([permissionId, row]) => ({ permission_id: permissionId, condition: row.condition }));

    setIsSubmitting(true);
    try {
      const saved = scheme
        ? await workspaceRBACService.updatePermissionScheme(workspaceSlug, scheme.id, {
            name: name.trim(),
            description,
            items,
          })
        : await workspaceRBACService.createPermissionScheme(workspaceSlug, { name: name.trim(), description, items });
      onSaved(saved);
      onClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: scheme ? t("rbac.bundle_editor.updated_title") : t("rbac.bundle_editor.created_title"),
        message: t("rbac.bundle_editor.saved_message", { name: saved.name }),
      });
    } catch (error: unknown) {
      const err = error as { error?: string; name?: string[] };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("rbac.bundle_editor.save_error_title"),
        message: err?.error ?? err?.name?.[0] ?? t("common.errors.default.message"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXXXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-h5-medium">
            {scheme ? t("rbac.bundle_editor.edit_title") : t("rbac.bundle_editor.create_title")}
          </h3>
          {isReadOnly && <SystemBadge />}
        </div>
        {isReadOnly && (
          <p className="text-caption-sm-regular text-tertiary">{t("rbac.bundle_editor.read_only_notice")}</p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-body-xs-medium text-secondary">{t("common.name")}</span>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
              disabled={isReadOnly}
              placeholder={t("rbac.bundle_editor.name_placeholder")}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-body-xs-medium text-secondary">{t("common.description")}</span>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full"
              disabled={isReadOnly}
              placeholder={t("rbac.bundle_editor.description_placeholder")}
            />
          </div>
        </div>

        <div className="overflow-y-auto rounded-md border border-subtle">
          {(Object.keys(catalogue) as TPermissionCategory[]).map((category) => {
            const permissions = catalogue[category];
            if (!permissions || permissions.length === 0) return null;
            return (
              <div key={category} className="border-b border-subtle last:border-b-0">
                <div className="bg-layer-1 px-3 py-1.5 text-caption-md-medium text-tertiary">
                  {CATEGORY_LABELS[category]}
                </div>
                {permissions.map((permission) => {
                  const row = rows[permission.id] ?? { included: false, condition: "NONE" as TPermissionCondition };
                  const conditionOptions = permission.supported_conditions.length
                    ? permission.supported_conditions
                    : (["NONE"] as TPermissionCondition[]);
                  const canPickCondition = conditionOptions.length > 1;
                  return (
                    <div
                      key={permission.id}
                      className="flex items-center justify-between gap-3 border-t border-subtle px-3 py-2 first:border-t-0"
                    >
                      <label className="flex flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={() => toggleIncluded(permission.id)}
                          disabled={isReadOnly}
                          className="size-3.5"
                        />
                        <span className="flex flex-col">
                          <span className="text-body-xs-regular text-primary">{permission.label}</span>
                          {permission.description && (
                            <span className="text-caption-sm-regular text-placeholder">{permission.description}</span>
                          )}
                        </span>
                      </label>
                      <CustomSelect
                        value={row.condition}
                        onChange={(value: TPermissionCondition) => setCondition(permission.id, value)}
                        label={CONDITION_LABELS[row.condition]}
                        disabled={isReadOnly || !row.included || !canPickCondition}
                        buttonClassName="border border-subtle bg-layer-2 w-44 shrink-0"
                      >
                        {conditionOptions.map((condition) => (
                          <CustomSelect.Option key={condition} value={condition}>
                            {CONDITION_LABELS[condition]}
                          </CustomSelect.Option>
                        ))}
                      </CustomSelect>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {isReadOnly ? t("close") : t("common.cancel")}
          </Button>
          {!isReadOnly && (
            <Button variant="primary" size="lg" onClick={handleSubmit} disabled={!name.trim()} loading={isSubmitting}>
              {scheme ? t("save_changes") : t("rbac.bundle_editor.create_title")}
            </Button>
          )}
        </div>
      </div>
    </ModalCore>
  );
}
