/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkspaceRole } from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// services
import workspaceRBACService from "@/services/workspace-rbac.service";

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (role: TWorkspaceRole) => void;
};

const useLegacyTierOptions = (): { value: number; label: string }[] => {
  const { t } = useTranslation();
  return [
    { value: 20, label: t("rbac.legacy_tier.admin") },
    { value: 15, label: t("rbac.legacy_tier.member") },
    { value: 5, label: t("rbac.legacy_tier.guest") },
  ];
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - "Create role" flow. `legacy_role_value` is
 * required by the backend on create (decision #5's anti-regression
 * bridge, `WorkspaceRoleViewSet.create`) - every one of the ~25
 * pre-existing inline legacy-role-integer comparisons OUTSIDE the 5
 * in-scope domains (billing, integrations, exports...) keeps reading this
 * value for any member holding this custom role, so it has to be picked
 * explicitly rather than defaulted silently.
 */
export function CreateRoleModal(props: Props) {
  const { workspaceSlug, isOpen, onClose, onCreated } = props;
  const { t } = useTranslation();
  const LEGACY_TIER_OPTIONS = useLegacyTierOptions();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [legacyRoleValue, setLegacyRoleValue] = useState<number>(15);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setName("");
      setDescription("");
      setLegacyRoleValue(15);
    }, 300);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const role = await workspaceRBACService.createRole(workspaceSlug, {
        name: name.trim(),
        description: description.trim(),
        legacy_role_value: legacyRoleValue,
      });
      onCreated(role);
      handleClose();
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("rbac.create_role.error_title"),
        message: err?.error ?? t("common.errors.default.message"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h3 className="text-h5-medium">{t("rbac.create_role.title")}</h3>
          <p className="mt-1 text-body-xs-regular text-secondary">{t("rbac.create_role.description")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">{t("common.name")}</span>
          <Input
            id="create-role-name"
            name="create-role-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("rbac.create_role.name_placeholder")}
            className="w-full"
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">{t("common.description")}</span>
          <Input
            id="create-role-description"
            name="create-role-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("rbac.create_role.description_placeholder")}
            className="w-full"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">{t("rbac.create_role.behaves_like_label")}</span>
          <p className="text-caption-sm-regular text-tertiary">{t("rbac.create_role.behaves_like_description")}</p>
          <CustomSelect
            value={legacyRoleValue}
            onChange={(value: number) => setLegacyRoleValue(value)}
            label={LEGACY_TIER_OPTIONS.find((option) => option.value === legacyRoleValue)?.label}
            buttonClassName="border border-subtle bg-layer-2 w-full"
          >
            {LEGACY_TIER_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {option.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="lg" onClick={handleSubmit} disabled={!name.trim()} loading={isSubmitting}>
            {t("rbac.create_role.title")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
