/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePriorities, TWorkflowConditionField, TWorkflowConditionOperator } from "@plane/types";
// components
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { LabelDropdown } from "@/components/issues/issue-layouts/properties/label-dropdown";
// local imports
import { MultiValueChipPicker } from "./multi-value-chip-picker";

type Props = {
  projectId: string;
  field: TWorkflowConditionField;
  operator: TWorkflowConditionOperator;
  value: string | string[] | null | undefined;
  onChange: (value: string | string[] | undefined) => void;
};

const asArray = (value: string | string[] | null | undefined): string[] => {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
};

const asScalar = (value: string | string[] | null | undefined): string | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

/**
 * Dispatches to the right value picker for a condition's `field`, in either
 * single-value mode (`is`/`is_not`) or multi-value mode (`in`/`not_in`).
 * `is_empty`/`is_not_empty` need no value input at all. Reuses the
 * project's existing per-entity dropdowns from `@/components/dropdowns` and
 * `label-dropdown` (the same components the sibling `TriageRuleFormModal`
 * - apps/web/core/components/intake/triage-rules/rule-form-modal.tsx -
 * already uses for its own condition/action value pickers) rather than the
 * `rich-filters/filter-value-input` widgets, which are wired to the
 * nested-tree filter engine's own value/label plumbing and would need
 * their own adapter layer for this flat condition shape.
 */
export function ConditionValueInput(props: Props) {
  const { projectId, field, operator, value, onChange } = props;
  const isMulti = operator === "in" || operator === "not_in";

  if (operator === "is_empty" || operator === "is_not_empty") return null;

  switch (field) {
    case "state_id":
      return isMulti ? (
        <MultiValueChipPicker
          value={asArray(value)}
          onChange={onChange}
          renderPicker={(p) => (
            <StateDropdown
              projectId={projectId}
              value={p.value}
              onChange={p.onChange}
              buttonVariant="border-with-text"
            />
          )}
        />
      ) : (
        <StateDropdown
          projectId={projectId}
          value={asScalar(value)}
          onChange={(v) => onChange(v)}
          buttonVariant="border-with-text"
        />
      );

    case "priority":
      return isMulti ? (
        <MultiValueChipPicker
          value={asArray(value)}
          onChange={onChange}
          renderPicker={(p) => (
            <PriorityDropdown
              value={(p.value as TIssuePriorities) ?? "none"}
              onChange={p.onChange}
              buttonVariant="border-with-text"
            />
          )}
        />
      ) : (
        <PriorityDropdown
          value={(asScalar(value) as TIssuePriorities) ?? "none"}
          onChange={(v) => onChange(v)}
          buttonVariant="border-with-text"
        />
      );

    case "cycle_id":
      return isMulti ? (
        <MultiValueChipPicker
          value={asArray(value)}
          onChange={onChange}
          renderPicker={(p) => (
            <CycleDropdown
              projectId={projectId}
              value={p.value}
              onChange={(v) => v && p.onChange(v)}
              buttonVariant="border-with-text"
            />
          )}
        />
      ) : (
        <CycleDropdown
          projectId={projectId}
          value={asScalar(value)}
          onChange={(v) => v && onChange(v)}
          buttonVariant="border-with-text"
        />
      );

    case "module_id":
      return isMulti ? (
        <ModuleDropdown
          projectId={projectId}
          multiple
          value={asArray(value)}
          onChange={onChange}
          buttonVariant="border-with-text"
        />
      ) : (
        <ModuleDropdown
          projectId={projectId}
          multiple={false}
          value={asScalar(value)}
          onChange={(v) => v && onChange(v)}
          buttonVariant="border-with-text"
        />
      );

    case "assignee_id":
      return isMulti ? (
        <MemberDropdown
          projectId={projectId}
          multiple
          value={asArray(value)}
          onChange={onChange}
          buttonVariant="border-with-text"
        />
      ) : (
        <MemberDropdown
          projectId={projectId}
          multiple={false}
          value={asScalar(value)}
          onChange={(v) => v && onChange(v)}
          buttonVariant="border-with-text"
        />
      );

    case "label_id": {
      const arrayValue = asArray(value);
      return (
        <LabelDropdown
          projectId={projectId}
          value={arrayValue}
          // `is`/`is_not` store a scalar id (only the most recently picked
          // one, since LabelDropdown is natively multi-select); `in`/
          // `not_in` store the full array.
          onChange={(next) => onChange(isMulti ? next : next[next.length - 1])}
          label={<span>{arrayValue.length > 0 ? `${arrayValue.length} label(s) selected` : "Choose label(s)"}</span>}
        />
      );
    }

    default:
      return null;
  }
}
