/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { GripVertical, X } from "lucide-react";
// plane imports
import type { TWorkflowActionType } from "@plane/types";
import { CustomSelect, DropIndicator } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { ActionConfigForm } from "./action-config-form";
import { ACTION_TYPE_LABELS, ACTION_TYPE_OPTIONS } from "./constants";
import type { TLocalWorkflowAction } from "./types";

type TDragData = { type: "workflow-action"; index: number };
const isWorkflowActionDragData = (data: Record<string | symbol, unknown>): data is TDragData =>
  data.type === "workflow-action";

type Props = {
  projectId: string;
  action: TLocalWorkflowAction;
  index: number;
  isLast: boolean;
  onChange: (patch: Partial<TLocalWorkflowAction>) => void;
  onRemove: () => void;
  onMove: (sourceIndex: number, destinationIndex: number) => void;
};

/**
 * One draggable, orderable action row - mirrors the closest-edge
 * drag-and-drop pattern already used for flat-list reordering elsewhere in
 * this codebase (`apps/web/core/components/project-states/state-item.tsx`,
 * for reordering a project's states), rather than the tree-item/
 * `attachInstruction` pattern used for nestable lists like labels
 * (`label-drag-n-drop-HOC.tsx`) - a rule's actions are always a flat,
 * ordered array, no nesting.
 */
export function ActionItem(props: Props) {
  const { projectId, action, index, isLast, onChange, onRemove, onMove } = props;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const initialData: TDragData = { type: "workflow-action", index };

    return combine(
      draggable({
        element,
        getInitialData: () => initialData,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => isWorkflowActionDragData(source.data),
        getData: ({ input, element: dropElement }) =>
          attachClosestEdge(initialData, { input, element: dropElement, allowedEdges: ["top", "bottom"] }),
        onDrag: (args) => setClosestEdge(extractClosestEdge(args.self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop: ({ self, source }) => {
          setClosestEdge(null);
          if (!isWorkflowActionDragData(source.data)) return;
          const sourceData = source.data;
          const edge = extractClosestEdge(self.data);
          let destinationIndex = index;
          if (edge === "bottom") destinationIndex += 1;
          if (sourceData.index < destinationIndex) destinationIndex -= 1;
          onMove(sourceData.index, destinationIndex);
        },
      })
    );
  }, [index, onMove]);

  return (
    <Fragment>
      <DropIndicator isVisible={closestEdge === "top"} />
      <div
        ref={elementRef}
        className={cn(
          "flex flex-col gap-2 rounded-md border border-subtle bg-surface-1 p-3",
          isDragging && "opacity-50"
        )}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-tertiary" aria-hidden="true" />
          <span className="shrink-0 text-12 text-tertiary">{index + 1}.</span>
          <CustomSelect
            value={action.action_type}
            label={ACTION_TYPE_LABELS[action.action_type]}
            onChange={(value: TWorkflowActionType) => onChange({ action_type: value, action_config: {} })}
            input
          >
            {ACTION_TYPE_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {option.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto shrink-0 rounded-sm p-1 text-tertiary hover:bg-layer-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="pl-6">
          <ActionConfigForm projectId={projectId} action={action} onChange={onChange} />
        </div>
      </div>
      {isLast && <DropIndicator isVisible={closestEdge === "bottom"} />}
    </Fragment>
  );
}
