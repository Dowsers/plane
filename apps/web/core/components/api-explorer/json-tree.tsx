/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";

type Props = {
  value: unknown;
  /** Node key/label rendered before the value (root call omits this). */
  label?: string;
  depth?: number;
};

const DEFAULT_EXPANDED_DEPTH = 1;

function valuePreview(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value !== null && typeof value === "object") return `Object(${Object.keys(value).length})`;
  return JSON.stringify(value);
}

/**
 * Minimal, dependency-free collapsible JSON tree - a plain formatted JSON
 * block (see `<pre>` fallback in response-viewer.tsx) is the documented
 * MVP baseline for this feature (item 5: "a plain formatted JSON block is
 * an acceptable MVP if a tree view adds too much scope"), but a shallow
 * recursive tree was cheap enough here to include as the default view,
 * with the raw block kept as an explicit alternate tab.
 */
export function JsonTree({ value, label, depth = 0 }: Props) {
  const isExpandable = value !== null && typeof value === "object";
  const [isExpanded, setIsExpanded] = useState(depth < DEFAULT_EXPANDED_DEPTH);

  if (!isExpandable) {
    return (
      <div className="font-mono flex items-start gap-1 py-0.5 pl-4 text-12 leading-5">
        {label !== undefined && <span className="text-tertiary">{label}:</span>}
        <span
          className={cn("text-primary", {
            "text-success-primary": typeof value === "string",
            "text-accent-primary": typeof value === "number",
            "text-warning-primary": typeof value === "boolean",
            "text-tertiary": value === null,
          })}
        >
          {JSON.stringify(value)}
        </span>
      </div>
    );
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);

  return (
    <div className="font-mono text-12 leading-5">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center gap-1 py-0.5 text-left hover:bg-layer-2"
      >
        {isExpanded ? (
          <ChevronDown className="size-3 shrink-0 text-tertiary" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-tertiary" />
        )}
        {label !== undefined && <span className="text-tertiary">{label}:</span>}
        {!isExpanded && <span className="text-tertiary">{valuePreview(value)}</span>}
      </button>
      {isExpanded && (
        <div className="border-l border-subtle pl-2">
          {entries.length === 0 && <div className="pl-4 text-tertiary">(empty)</div>}
          {entries.map(([key, child]) => (
            <JsonTree key={key} label={key} value={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
