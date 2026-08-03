/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { isGroupNode } from "@plane/utils";
// local imports
import { FilterExpressionSummary } from "./filter-summary";
import { FilterGroup } from "./group-node";

export type TAdvancedFiltersModalProps<P extends TFilterProperty, E extends TExternalFilter> = {
  filter: IFilterInstance<P, E>;
  isOpen: boolean;
  onClose: () => void;
  isDisabled?: boolean;
};

/**
 * The "Advanced filters" tree-builder panel: a modal showing a natural-language summary of the
 * current filter tree, followed by the recursive group/condition builder rooted at the filter's
 * (normalized-to-a-group) root expression.
 *
 * Operates on the exact same `IFilterInstance`/expression as the simple/flat mode in `filters-row`
 * - there are not two parallel representations, so switching between the two never loses data (a
 * flat AND list of conditions IS just a group node with `logicalOperator: AND` and no nesting).
 */
export const AdvancedFiltersModal = observer(function AdvancedFiltersModal<
  P extends TFilterProperty,
  E extends TExternalFilter,
>(props: TAdvancedFiltersModalProps<P, E>) {
  const { filter, isOpen, onClose, isDisabled = false } = props;

  // Normalize the root into an explicit group node whenever it isn't one - both when the panel
  // first opens (root may be `null` or a bare condition coming from simple mode) AND while editing
  // (e.g. deleting a nested group can leave the root with a single remaining condition child, which
  // the generic tree-simplification logic auto-unwraps down to a bare condition - see
  // `unwrapGroupIfNeeded`/`shouldUnwrapGroup` - so the invariant "root is a group while this panel
  // is open" has to be re-asserted reactively, not just once on open). Re-running is a no-op once
  // the root is already a group, so this never loops.
  useEffect(() => {
    if (isOpen && (!filter.expression || !isGroupNode(filter.expression))) {
      filter.ensureRootGroup();
    }
  }, [isOpen, filter, filter.expression]);

  const rootGroup = filter.expression && isGroupNode(filter.expression) ? filter.expression : null;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VIXL}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-subtle-1 p-4">
          <div className="min-w-0">
            <h3 className="text-16 font-medium">Advanced filters</h3>
            <FilterExpressionSummary filter={filter} className="mt-1" />
          </div>
        </div>

        <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto p-4">
          {rootGroup ? (
            <FilterGroup filter={filter} group={rootGroup} depth={1} isRoot isDisabled={isDisabled} />
          ) : (
            <div className="text-13 text-placeholder">No filters yet.</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle-1 p-4">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
