/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { sortBy } from "lodash-es";
import { X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPermission, TPermissionScheme, TWorkspaceRole } from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, Input, Loader, ModalCore } from "@plane/ui";
// services
import workspaceRBACService from "@/services/workspace-rbac.service";
// local imports
import { ConditionBadgeList } from "./condition-badge";
import { SystemBadge } from "./system-badge";

type Props = {
  workspaceSlug: string;
  role: TWorkspaceRole;
  allSchemes: TPermissionScheme[] | undefined;
  catalogueByKey: Record<string, TPermission>;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (role: TWorkspaceRole) => void;
};

const GUEST_LEGACY_VALUE = 5;

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - "Edit role" modal: name/description
 * (editable even for a system role - only `is_system`/`is_owner_equivalent`/
 * `legacy_role_value` are read-only for those, exigence 4/6), the
 * attached-bundle chip list (add/remove, exigence 2/3), and an aggregated
 * effective-permissions preview with condition badges (spec's own UI
 * section). Every bundle add/remove applies immediately (one atomic
 * `POST .../schemes/` per toggle, matching the backend's own
 * replace-the-whole-set semantics) rather than behind a separate "Save"
 * step, mirroring the spec's own "chips ajout/retrait" wording.
 */
export function RoleEditorModal(props: Props) {
  const { workspaceSlug, role, allSchemes, catalogueByKey, isOpen, onClose, onUpdated } = props;
  const [currentRole, setCurrentRole] = useState(role);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [pendingSchemeId, setPendingSchemeId] = useState<string | null>(null);

  // Re-sync the local draft whenever a DIFFERENT role is opened (not on
  // every parent re-render, so a save-in-flight round trip never clobbers
  // what's being typed).
  useEffect(() => {
    setCurrentRole(role);
    setName(role.name);
    setDescription(role.description);
  }, [role.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isGuest = currentRole.is_system && currentRole.legacy_role_value === GUEST_LEGACY_VALUE;
  const attachedSchemeIds = currentRole.schemes.map((scheme) => scheme.id);
  const availableSchemes = (allSchemes ?? []).filter((scheme) => !attachedSchemeIds.includes(scheme.id));
  const isDetailsDirty = name.trim() !== currentRole.name || description !== currentRole.description;

  const handleSaveDetails = async () => {
    if (!name.trim()) return;
    setIsSavingDetails(true);
    try {
      const updated = await workspaceRBACService.updateRole(workspaceSlug, currentRole.id, {
        name: name.trim(),
        description,
      });
      setCurrentRole(updated);
      onUpdated(updated);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Role updated", message: `"${updated.name}" was saved.` });
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not save role",
        message: err?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSavingDetails(false);
    }
  };

  const applySchemeIds = async (nextSchemeIds: string[], togglingSchemeId: string) => {
    setPendingSchemeId(togglingSchemeId);
    try {
      const updated = await workspaceRBACService.setRoleSchemes(workspaceSlug, currentRole.id, {
        scheme_ids: nextSchemeIds,
      });
      setCurrentRole(updated);
      onUpdated(updated);
    } catch (error: unknown) {
      const err = error as { error?: string; missing_permissions?: string[] };
      const missing = err?.missing_permissions?.length
        ? ` (would leave ${err.missing_permissions.join(", ")} unprotected)`
        : "";
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not update bundles",
        message: `${err?.error ?? "Something went wrong. Please try again."}${missing}`,
      });
    } finally {
      setPendingSchemeId(null);
    }
  };

  const handleAttach = (schemeId: string) => {
    if (attachedSchemeIds.includes(schemeId)) return;
    void applySchemeIds([...attachedSchemeIds, schemeId], schemeId);
  };

  const handleDetach = (schemeId: string) => {
    void applySchemeIds(
      attachedSchemeIds.filter((id) => id !== schemeId),
      schemeId
    );
  };

  const permissionEntries = sortBy(Object.entries(currentRole.effective_permissions), ([key]) => key);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex max-h-[80vh] flex-col gap-5 overflow-y-auto p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-h5-medium">Edit role</h3>
          {currentRole.is_system && <SystemBadge />}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-body-xs-medium text-secondary">Name</span>
            <Input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-body-xs-medium text-secondary">Description</span>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full"
              placeholder="Optional"
            />
          </div>
          <Button
            variant="secondary"
            size="lg"
            onClick={handleSaveDetails}
            disabled={!isDetailsDirty}
            loading={isSavingDetails}
          >
            Save
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">Attached bundles</span>
          {isGuest ? (
            <p className="text-caption-sm-regular text-tertiary">
              The Guest role cannot be customized (billing/seat-limit logic depends on it staying fixed).
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {currentRole.schemes.length === 0 && (
                  <span className="text-caption-sm-regular text-placeholder">No bundles attached yet.</span>
                )}
                {currentRole.schemes.map((scheme) => (
                  <Pill
                    key={scheme.id}
                    variant={EPillVariant.PRIMARY}
                    size={EPillSize.SM}
                    className="flex items-center gap-1"
                  >
                    {scheme.name}
                    <button
                      type="button"
                      onClick={() => handleDetach(scheme.id)}
                      disabled={pendingSchemeId !== null}
                      aria-label={`Remove ${scheme.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </Pill>
                ))}
              </div>
              {availableSchemes.length > 0 && (
                <CustomSelect
                  value=""
                  onChange={(schemeId: string) => handleAttach(schemeId)}
                  label="+ Add bundle"
                  disabled={pendingSchemeId !== null}
                  buttonClassName="border border-subtle bg-layer-2 w-fit"
                >
                  {availableSchemes.map((scheme) => (
                    <CustomSelect.Option key={scheme.id} value={scheme.id}>
                      {scheme.name}
                      {scheme.is_system ? " (System)" : ""}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-body-xs-medium text-secondary">Effective permissions ({permissionEntries.length})</span>
          {allSchemes === undefined ? (
            <Loader className="flex flex-col gap-2">
              <Loader.Item height="24px" />
              <Loader.Item height="24px" />
            </Loader>
          ) : permissionEntries.length === 0 ? (
            <span className="text-caption-sm-regular text-placeholder">
              This role grants none of the 5 in-scope permissions yet.
            </span>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-md border border-subtle bg-layer-1 p-3">
              {permissionEntries.map(([key, conditions]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-caption-sm-regular text-secondary">{catalogueByKey[key]?.label ?? key}</span>
                  <ConditionBadgeList conditions={conditions} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
