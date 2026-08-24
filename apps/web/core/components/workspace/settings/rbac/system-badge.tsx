/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { Tooltip } from "@plane/propel/tooltip";

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - "System" badge next to a non-deletable
 * `WorkspaceRole`/`PermissionScheme` (`is_system: true` - exigence 4/6),
 * matching the spec's own literal UI wording ("affichage d'un badge
 * 'Systeme' a cote des roles non supprimables").
 */
export function SystemBadge({ className }: { className?: string }) {
  return (
    <Tooltip tooltipContent="Built in - cannot be deleted.">
      <span>
        <Pill variant={EPillVariant.PRIMARY} size={EPillSize.SM} className={className}>
          System
        </Pill>
      </span>
    </Tooltip>
  );
}
