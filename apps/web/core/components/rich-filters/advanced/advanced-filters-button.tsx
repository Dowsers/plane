/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ListTree } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty } from "@plane/types";
// local imports
import { AdvancedFiltersModal } from "./advanced-filters-modal";

export type TAdvancedFiltersButtonProps<P extends TFilterProperty, E extends TExternalFilter> = {
  filter: IFilterInstance<P, E>;
  isDisabled?: boolean;
};

/**
 * Entry point into the advanced (nested AND/OR/NOT) filter tree-builder. Rendered alongside the
 * existing simple/flat filter row - opening it never disrupts the flat view underneath, since both
 * views operate on the exact same `IFilterInstance` expression.
 */
export const AdvancedFiltersButton = observer(function AdvancedFiltersButton<
  P extends TFilterProperty,
  E extends TExternalFilter,
>(props: TAdvancedFiltersButtonProps<P, E>) {
  const { filter, isDisabled = false } = props;
  const [isOpen, setIsOpen] = useState(false);

  if (!filter.configManager.areConfigsReady) return null;

  return (
    <>
      <Button variant="secondary" size="sm" className="py-1" onClick={() => setIsOpen(true)} prependIcon={<ListTree />}>
        Advanced filters
      </Button>
      <AdvancedFiltersModal filter={filter} isOpen={isOpen} onClose={() => setIsOpen(false)} isDisabled={isDisabled} />
    </>
  );
});
