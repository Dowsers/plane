/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AUDIT_EVENT_TYPE_OPTIONS } from "@plane/constants";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { TAuditEventType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// components
import { FilterOption } from "@/components/issues/issue-layouts/filters";

type Props = {
  value: TAuditEventType[];
  onChange: (value: TAuditEventType[]) => void;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3+5 merged, exigence 8 - event type
 * multi-select filter for the audit log table, mirroring the existing
 * `MemberListFiltersDropdown` (apps/web/core/components/project/dropdowns/
 * filters/member-list.tsx) checkbox-list pattern.
 */
export function AuditLogEventTypeFilterDropdown(props: Props) {
  const { value, onChange } = props;

  const toggle = (eventType: TAuditEventType) => {
    onChange(value.includes(eventType) ? value.filter((v) => v !== eventType) : [...value, eventType]);
  };

  return (
    <CustomMenu
      customButton={
        <div className="relative flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-body-xs-regular">
          <span>Event type{value.length > 0 ? ` (${value.length})` : ""}</span>
          <ChevronDownIcon className="h-3 w-3" />
        </div>
      }
      placement="bottom-start"
    >
      <div className="max-h-72 w-56 overflow-y-auto">
        {AUDIT_EVENT_TYPE_OPTIONS.map((option) => (
          <FilterOption
            key={option.value}
            isChecked={value.includes(option.value)}
            title={option.label}
            onClick={() => toggle(option.value)}
          />
        ))}
      </div>
    </CustomMenu>
  );
}
