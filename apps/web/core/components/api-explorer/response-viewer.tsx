/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Badge } from "@plane/propel/badge";
import type { TApiExplorerHistoryEntry } from "@plane/types";
// local imports
import { JsonTree } from "./json-tree";

type Props = {
  entry: TApiExplorerHistoryEntry | null;
};

type TView = "tree" | "raw" | "headers";

function statusVariant(status: number | null): "success" | "warning" | "danger" | "neutral" {
  if (status === null) return "neutral";
  if (status >= 200 && status < 300) return "success";
  if (status >= 400) return "danger";
  return "warning";
}

/**
 * Spec exigence 7/item 5: HTTP status, timing, headers, body - both a raw
 * view and a simple collapsible tree. Never shows a fake success (spec
 * exigence 15): a network-level failure (no response at all) renders its
 * own distinct error state rather than being coerced into a fake "200".
 */
export function ResponseViewer({ entry }: Props) {
  const [view, setView] = useState<TView>("tree");

  if (!entry) {
    return (
      <div className="grid h-full place-items-center rounded-md border border-dashed border-subtle p-8">
        <p className="text-13 text-tertiary">Execute a request to see its response here.</p>
      </div>
    );
  }

  if (entry.error) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-danger-strong bg-danger-subtle p-3">
        <Badge variant="danger" size="base">
          Network error
        </Badge>
        <p className="text-13 text-danger-primary">{entry.error}</p>
        <p className="text-12 text-tertiary">
          The request never received a response (timeout, DNS failure, CORS, or the instance is unreachable).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={statusVariant(entry.status)} size="lg">
          {entry.status} {entry.statusText}
        </Badge>
        <span className="text-12 text-tertiary">{entry.durationMs}ms</span>
      </div>

      <div className="flex items-center gap-1 text-12">
        {(["tree", "raw", "headers"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setView(tab)}
            className={`rounded-md px-2 py-1 capitalize ${view === tab ? "bg-layer-2 text-primary" : "text-tertiary"}`}
          >
            {tab === "tree" ? "Tree" : tab === "raw" ? "Raw JSON" : "Headers"}
          </button>
        ))}
      </div>

      {view === "tree" && (
        <div className="max-h-[420px] overflow-auto rounded-md border border-subtle bg-layer-1 p-2">
          <JsonTree value={entry.responseBody} />
        </div>
      )}
      {view === "raw" && (
        <pre className="max-h-[420px] overflow-auto rounded-md border border-subtle bg-layer-1 p-2 text-12 text-primary">
          {JSON.stringify(entry.responseBody, null, 2)}
        </pre>
      )}
      {view === "headers" && (
        <div className="max-h-[420px] overflow-auto rounded-md border border-subtle bg-layer-1 p-2">
          {Object.entries(entry.responseHeaders).length === 0 && (
            <p className="text-12 text-tertiary">No headers captured.</p>
          )}
          <table className="w-full text-12">
            <tbody>
              {Object.entries(entry.responseHeaders).map(([key, value]) => (
                <tr key={key} className="border-b border-subtle last:border-0">
                  <td className="font-mono py-1 pr-3 align-top text-tertiary">{key}</td>
                  <td className="font-mono py-1 align-top break-all text-primary">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
