/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";
// components
import type { TFiltersRowProps } from "@/components/rich-filters/filters-row";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { NLFilterAssistant } from "@/components/rich-filters/nl-assistant/root";

type TWorkItemFiltersRowProps = TFiltersRowProps<TWorkItemFilterProperty, TWorkItemFilterExpression> & {
  filter: IWorkItemFilterInstance;
};

export const WorkItemFiltersRow = observer(function WorkItemFiltersRow(props: TWorkItemFiltersRowProps) {
  const { filter, variant = "header" } = props;
  return (
    <div className="flex w-full flex-col gap-2">
      <FiltersRow {...props} />
      {/* Natural-language filter assistant - see docs/feature-specs/04-views-filters.md
          ("Assistant de filtre en langage naturel") in plane-selfhost. Only shown on real
          issue-list toolbars (the default "header" variant) - the "modal" variant is the
          save/edit-view form, where an NL query previewing into a form draft would be
          confusing rather than helpful. */}
      {variant !== "modal" && filter.configManager.areConfigsReady && <NLFilterAssistant filter={filter} />}
    </div>
  );
});
