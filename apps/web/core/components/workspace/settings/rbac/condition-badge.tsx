/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import type { TPermissionCondition } from "@plane/types";

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 4 - the exact two condition badges the spec's
 * own UI section names literally ("Creer uniquement" / "Project lead
 * uniquement"). `"NONE"` renders nothing - an unconditional grant needs no
 * badge (the absence of a badge already communicates "granted outright").
 */
const CONDITION_LABELS: Record<TPermissionCondition, string | null> = {
  NONE: null,
  CREATOR_ONLY: "Creator only",
  PROJECT_LEAD_ONLY: "Project lead only",
};

type Props = {
  condition: TPermissionCondition;
  className?: string;
};

export function ConditionBadge(props: Props) {
  const { condition, className } = props;
  const label = CONDITION_LABELS[condition];
  if (!label) return null;

  return (
    <Pill variant={EPillVariant.DEFAULT} size={EPillSize.SM} className={className}>
      {label}
    </Pill>
  );
}

/** A permission key can be granted through more than one condition at
 * once (union-of-bundles semantics, exigence 3) - renders one badge per
 * non-`"NONE"` condition, or nothing at all if the union already includes
 * an unconditional `"NONE"` grant (matches the resolver's own "NONE is
 * absorbing" rule - see `plane.utils.rbac._compute_role_permissions`). */
export function ConditionBadgeList(props: { conditions: TPermissionCondition[]; className?: string }) {
  const { conditions, className } = props;
  if (conditions.includes("NONE")) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {conditions.map((condition) => (
        <ConditionBadge key={condition} condition={condition} className={className} />
      ))}
    </div>
  );
}
