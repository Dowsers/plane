/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RotateCcw } from "lucide-react";
// plane imports
import { Badge } from "@plane/propel/badge";
import type { TApiExplorerHistoryEntry } from "@plane/types";

type Props = {
  entries: TApiExplorerHistoryEntry[];
  onReplay: (entry: TApiExplorerHistoryEntry) => void;
};

const METHOD_BADGE_VARIANT: Record<string, "brand" | "success" | "warning" | "danger"> = {
  GET: "brand",
  POST: "success",
  PUT: "warning",
  PATCH: "warning",
  DELETE: "danger",
};

function statusVariant(status: number | null): "success" | "warning" | "danger" | "neutral" {
  if (status === null) return "neutral";
  if (status >= 200 && status < 300) return "success";
  if (status >= 400) return "danger";
  return "warning";
}

/**
 * Spec exigence 10/item 7: last N calls made in this browser session
 * (client-side only - the backend has no "list my explorer history"
 * endpoint, per this session's own research finding), replayable.
 */
export function HistoryPanel({ entries, onReplay }: Props) {
  if (entries.length === 0) {
    return <p className="p-2 text-13 text-tertiary">No calls made yet in this session.</p>;
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-layer-1">
          <Badge variant={METHOD_BADGE_VARIANT[entry.method.toUpperCase()] ?? "neutral"} size="sm">
            {entry.method.toUpperCase()}
          </Badge>
          <span className="font-mono flex-1 truncate text-12 text-primary">{entry.url}</span>
          <Badge variant={statusVariant(entry.status)} size="sm">
            {entry.error ? "ERR" : entry.status}
          </Badge>
          <button
            type="button"
            onClick={() => onReplay(entry)}
            className="text-tertiary hover:text-primary"
            aria-label="Replay this call"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
