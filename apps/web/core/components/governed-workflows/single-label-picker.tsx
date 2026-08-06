/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { LabelDropdown } from "@/components/issues/issue-layouts/properties/label-dropdown";

type Props = {
  projectId: string;
  labelId: string | undefined;
  onChange: (labelId: string | undefined) => void;
};

/**
 * Single-label-id picker built on top of the multi-select `LabelDropdown`
 * (no single-select label dropdown exists in this codebase - see
 * apps/web/core/components/issues/issue-layouts/properties/label-dropdown.tsx,
 * whose `value`/`onChange` are hard-coded to `string[]`) - treats the array
 * as holding at most one id, taking whichever entry the user most recently
 * toggled on. Shared by `LABEL_PRESENT`/`LABEL_ABSENT` conditions and
 * `ADD_LABEL`/`REMOVE_LABEL` actions, which all store a single `label_id`.
 */
export function SingleLabelPicker(props: Props) {
  const { projectId, labelId, onChange } = props;
  const currentValue = labelId ? [labelId] : [];
  return (
    <LabelDropdown
      projectId={projectId}
      value={currentValue}
      onChange={(ids) => {
        const newlyAdded = ids.find((id) => !currentValue.includes(id));
        onChange(newlyAdded ?? ids[0]);
      }}
      label={<span>{labelId ? "1 label selected" : "Choose label"}</span>}
    />
  );
}
