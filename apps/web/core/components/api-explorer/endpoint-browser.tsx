/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Badge } from "@plane/propel/badge";
import type { TApiExplorerEndpoint } from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { groupEndpointsByTag, matchesSearch } from "./utils";

type Props = {
  endpoints: TApiExplorerEndpoint[];
  selectedEndpointId: string | null;
  onSelect: (endpoint: TApiExplorerEndpoint) => void;
};

const METHOD_BADGE_VARIANT: Record<string, "brand" | "success" | "warning" | "danger"> = {
  get: "brand",
  post: "success",
  put: "warning",
  patch: "warning",
  delete: "danger",
};

export function EndpointBrowser({ endpoints, selectedEndpointId, onSelect }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => endpoints.filter((endpoint) => matchesSearch(endpoint, search)), [endpoints, search]);
  const grouped = useMemo(() => groupEndpointsByTag(filtered), [filtered]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative shrink-0">
        <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-tertiary" />
        <input
          id="endpoint-browser-search"
          name="endpoint-browser-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("api_explorer.endpoint_browser.search_placeholder")}
          className="focus:border-accent-primary w-full rounded-md border border-subtle bg-layer-1 py-1.5 pr-2 pl-7 text-13 text-primary outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <p className="p-2 text-13 text-tertiary">{t("api_explorer.endpoint_browser.no_matches")}</p>
        )}
        {[...grouped.entries()].map(([tag, items]) => (
          <div key={tag} className="mb-2">
            <div className="sticky top-0 bg-surface-1 px-1 py-1 text-11 font-semibold tracking-wide text-tertiary uppercase">
              {tag}
            </div>
            {items.map((endpoint) => (
              <button
                key={endpoint.id}
                type="button"
                onClick={() => onSelect(endpoint)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-layer-1",
                  { "bg-layer-2": endpoint.id === selectedEndpointId }
                )}
              >
                <div className="flex w-full items-center gap-2">
                  <Badge variant={METHOD_BADGE_VARIANT[endpoint.method] ?? "neutral"} size="sm">
                    {endpoint.method.toUpperCase()}
                  </Badge>
                  <span className="font-mono truncate text-12 text-primary">{endpoint.path}</span>
                </div>
                {endpoint.summary && <span className="truncate pl-0.5 text-12 text-tertiary">{endpoint.summary}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
