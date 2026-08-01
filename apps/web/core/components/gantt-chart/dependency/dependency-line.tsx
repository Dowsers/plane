/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { X } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";

const JOG = 16;

type Props = {
  blockingLabel: string;
  blockedLabel: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isConflict: boolean;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  onRemove: () => void;
};

export function GanttDependencyLine(props: Props) {
  const { blockingLabel, blockedLabel, x1, y1, x2, y2, isConflict, isHovered, onHover, onRemove } = props;

  const midX = x1 + JOG;
  const path = `M ${x1},${y1} H ${midX} V ${y2} H ${x2}`;
  const color = isConflict ? "var(--text-color-danger-primary)" : "var(--text-color-tertiary)";
  const midY = (y1 + y2) / 2;

  return (
    <g onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <title>
        {blockingLabel} blocks {blockedLabel}
        {isConflict ? " - dates overlap" : ""}
      </title>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={isHovered ? 2 : 1.5}
        markerEnd="url(#gantt-dependency-arrow)"
        style={{ pointerEvents: "none" }}
      />
      {isHovered && (
        <foreignObject x={midX - 10} y={midY - 10} width={20} height={20} style={{ pointerEvents: "auto" }}>
          <Tooltip tooltipContent="Remove dependency" position="top">
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded-full border border-subtle bg-surface-1 text-secondary hover:text-danger-primary"
              onClick={onRemove}
            >
              <X className="size-3" />
            </button>
          </Tooltip>
        </foreignObject>
      )}
    </g>
  );
}
