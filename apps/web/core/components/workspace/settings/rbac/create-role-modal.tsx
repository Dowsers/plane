/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
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

const LEGACY_TIER_OPTIONS: { value: number; label: string }[] = [
  { value: 20, label: "Admin" },
  { value: 15, label: "Member" },
  { value: 5, label: "Guest" },
];

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
        title: "Could not create role",
        message: err?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h3 className="text-h5-medium">Create role</h3>
          <p className="mt-1 text-body-xs-regular text-secondary">
            A role starts with no bundles attached - add them from the editor once it is created.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">Name</span>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Junior Project Lead"
            className="w-full"
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">Description</span>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="w-full"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">
            Behaves like (for settings this builder doesn't cover yet)
          </span>
          <p className="text-caption-sm-regular text-tertiary">
            Only Issue/Cycle/Module/Page/View permissions are driven by the bundles you attach below. Every other area
            of Plane (billing, integrations, exports...) still checks this member's tier directly - pick the closest
            match.
          </p>
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
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={handleSubmit} disabled={!name.trim()} loading={isSubmitting}>
            Create role
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
