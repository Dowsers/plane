/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Disclosure } from "@headlessui/react";
import { sortBy } from "lodash-es";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
// plane imports
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import type { TPermission, TWorkspaceRole } from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { ConditionBadgeList } from "./condition-badge";
import { SystemBadge } from "./system-badge";

type Props = {
  role: TWorkspaceRole;
  catalogueByKey: Record<string, TPermission>;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - one row of the Roles tab (Workspace
 * Settings > Members > Roles): name + "System" badge for a non-deletable
 * role, attached-bundle chips, and a collapsed-by-default aggregated
 * effective-permissions preview with per-permission condition badges,
 * matching the spec's own UI section verbatim.
 */
export function RoleListItem(props: Props) {
  const { role, catalogueByKey, onEdit, onDelete } = props;
  const [showPermissions, setShowPermissions] = useState(false);

  const permissionEntries = sortBy(Object.entries(role.effective_permissions), ([key]) => key);

  return (
    <div className="flex flex-col gap-3 border-b border-subtle py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h4 className="text-body-sm-medium text-primary">{role.name}</h4>
            {role.is_system && <SystemBadge />}
            <Pill variant={EPillVariant.DEFAULT} size={EPillSize.SM}>
              {role.member_count} {role.member_count === 1 ? "member" : "members"}
            </Pill>
          </div>
          {role.description && <p className="text-caption-md-regular text-tertiary">{role.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {role.schemes.length === 0 ? (
              <span className="text-caption-sm-regular text-placeholder">No bundles attached</span>
            ) : (
              role.schemes.map((scheme) => (
                <Pill key={scheme.id} variant={EPillVariant.PRIMARY} size={EPillSize.SM}>
                  {scheme.name}
                </Pill>
              ))
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-caption-md-medium text-secondary hover:bg-layer-1"
          >
            <Pencil className="size-3.5" /> Edit
          </button>
          {!role.is_system && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-caption-md-medium text-danger-primary hover:bg-layer-1"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      <Disclosure>
        <Disclosure.Button
          onClick={() => setShowPermissions((prev) => !prev)}
          className="flex w-fit items-center gap-1 text-caption-sm-medium text-tertiary hover:text-secondary"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", { "-rotate-90": !showPermissions })} />
          {showPermissions ? "Hide" : "Show"} effective permissions ({permissionEntries.length})
        </Disclosure.Button>
        {showPermissions && (
          <Disclosure.Panel className="mt-2 flex flex-col gap-1.5 rounded-md border border-subtle bg-layer-1 p-3">
            {permissionEntries.length === 0 && (
              <span className="text-caption-sm-regular text-placeholder">
                This role grants none of the 5 in-scope permissions.
              </span>
            )}
            {permissionEntries.map(([key, conditions]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-caption-sm-regular text-secondary">{catalogueByKey[key]?.label ?? key}</span>
                <ConditionBadgeList conditions={conditions} />
              </div>
            ))}
          </Disclosure.Panel>
        )}
      </Disclosure>
    </div>
  );
}
