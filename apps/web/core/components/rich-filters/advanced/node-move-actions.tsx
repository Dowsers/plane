/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty } from "@plane/types";

type TNodeMoveActionsProps<P extends TFilterProperty, E extends TExternalFilter> = {
  filter: IFilterInstance<P, E>;
  nodeId: string;
  index: number;
  siblingCount: number;
};

/**
 * Reorder (up/down among siblings) and duplicate actions for a single condition/group row inside
 * the advanced tree builder. Deliberately does NOT include a "move into a different parent group"
 * affordance - v1 only supports reordering within the same parent (see `IFilterInstance.moveNode`
 * doc comment and the feature report for this scope decision); moving a node to a different group
 * means deleting it and re-adding it there.
 */
export const NodeMoveActions = observer(function NodeMoveActions<P extends TFilterProperty, E extends TExternalFilter>(
  props: TNodeMoveActionsProps<P, E>
) {
  const { filter, nodeId, index, siblingCount } = props;
  // plane hooks
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-0.5 pt-0.5">
      <IconButton
        variant="ghost"
        size="sm"
        icon={ChevronUp}
        disabled={index === 0}
        onClick={() => filter.moveNode(nodeId, "up")}
        aria-label={t("rich_filters.advanced.move_actions.move_up_aria")}
      />
      <IconButton
        variant="ghost"
        size="sm"
        icon={ChevronDown}
        disabled={index === siblingCount - 1}
        onClick={() => filter.moveNode(nodeId, "down")}
        aria-label={t("rich_filters.advanced.move_actions.move_down_aria")}
      />
      <IconButton
        variant="ghost"
        size="sm"
        icon={Copy}
        onClick={() => filter.duplicateNode(nodeId)}
        aria-label={t("common.duplicate")}
      />
    </div>
  );
});
