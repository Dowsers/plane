/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent as ReactMouseEvent } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Transition } from "@headlessui/react";
import { Sparkle, TriangleAlert } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { FilterInstance, workItemFiltersAdapter } from "@plane/shared-state";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type {
  TNLFilterAssistantRecentQuery,
  TNLFilterAssistantStatus,
  TWorkItemFilterExpression,
  TWorkItemFilterProperty,
} from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { FilterItem } from "@/components/rich-filters/filter-item/root";
// services
import { nlFilterAssistantService } from "@/services/nl-filter-assistant.service";

type TNLFilterAssistantProps = {
  /** The live filter instance this assistant previews into and, on "Apply",
   * commits its result onto - see docs/feature-specs/04-views-filters.md
   * ("Assistant de filtre en langage naturel"), requirement 7, in
   * plane-selfhost. */
  filter: IWorkItemFilterInstance;
};

type TParsedResult = {
  status: TNLFilterAssistantStatus;
  restatement: string;
  unresolvedTerms: string[];
};

/**
 * Natural-language filter assistant entry point - a search-style input that
 * parses a free-text query (English or French) into filter conditions via
 * the deterministic, rule-based backend parser (no LLM call - see
 * `apps/api/plane/utils/nl_filter_parser.py`), previews the result as
 * editable pills using the same `FilterItem` chip UI as the manual filter
 * panel, and only touches the real, live `filter` once the user hits
 * "Apply" - never on parse alone.
 *
 * The preview reuses a second, throwaway `FilterInstance` that shares the
 * parent `filter`'s already-populated field configs (member/label/state/
 * cycle/module display data) rather than a bespoke chip renderer - see the
 * feature's patch README for why this is safe (a `FilterConfig` holds no
 * back-reference to a specific filter instance, it is pure display/value
 * metadata, freely shared across instances).
 */
export const NLFilterAssistant = observer(function NLFilterAssistant(props: TNLFilterAssistantProps) {
  const { filter } = props;
  const { workspaceSlug, projectId } = useParams();
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TParsedResult | null>(null);
  const [recentQueries, setRecentQueries] = useState<TNLFilterAssistantRecentQuery[]>([]);
  const [hasLoadedRecent, setHasLoadedRecent] = useState(false);
  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewFilter = useMemo<IWorkItemFilterInstance>(
    () => new FilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>({ adapter: workItemFiltersAdapter }),
    []
  );

  useEffect(() => {
    if (filter.configManager.areConfigsReady) {
      previewFilter.configManager.registerAll(Array.from(filter.configManager.filterConfigs.values()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.configManager.areConfigsReady, filter.configManager.filterConfigs]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Focus the input programmatically (rather than the `autoFocus` JSX prop,
  // which `eslint-plugin-jsx-a11y`/`no-autofocus` flags) whenever the panel opens.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const resetPreview = () => {
    setResult(null);
    previewFilter.resetExpression({} as TWorkItemFilterExpression, true);
  };

  const fetchRecent = async () => {
    if (!workspaceSlug || hasLoadedRecent) return;
    setHasLoadedRecent(true);
    try {
      const recent = await nlFilterAssistantService.listRecent(
        workspaceSlug.toString(),
        projectId ? projectId.toString() : undefined
      );
      setRecentQueries(recent ?? []);
    } catch {
      // Best-effort only - recent suggestions are a convenience, not a
      // requirement for the assistant to function.
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    fetchRecent();
  };

  const runQuery = async (rawQuery: string) => {
    if (!workspaceSlug || !rawQuery.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setResult(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = projectId
        ? await nlFilterAssistantService.parseForProject(workspaceSlug.toString(), projectId.toString(), {
            query: rawQuery,
            timezone,
          })
        : await nlFilterAssistantService.parseForWorkspace(workspaceSlug.toString(), { query: rawQuery, timezone });

      previewFilter.resetExpression(response.filters, true);
      setResult({
        status: response.status,
        restatement: response.restatement,
        unresolvedTerms: response.unresolved_terms,
      });
      // The recent-queries list just changed server-side - refetch on next open.
      setHasLoadedRecent(false);
    } catch (error) {
      const message =
        (error as { error?: string; detail?: string })?.error ??
        (error as { error?: string; detail?: string })?.detail ??
        "Something went wrong while parsing this query. Please try again.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Could not parse this query", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    runQuery(query);
  };

  const handleRecentClick = (recentQuery: TNLFilterAssistantRecentQuery) => {
    setQuery(recentQuery.raw_query);
    runQuery(recentQuery.raw_query);
  };

  const handleApply = () => {
    if (!previewFilter.expression) return;
    filter.resetExpression(workItemFiltersAdapter.toExternal(previewFilter.expression));
    setIsOpen(false);
    setQuery("");
    resetPreview();
  };

  const handleDiscard = (event: ReactMouseEvent) => {
    event.preventDefault();
    setIsOpen(false);
    setQuery("");
    resetPreview();
  };

  const hasPreviewConditions = previewFilter.allConditionsForDisplay.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "flex h-6 items-center gap-1.5 rounded-md border border-subtle px-2 text-body-xs-medium text-secondary hover:bg-layer-2-hover hover:text-primary",
          isOpen && "bg-layer-2-hover text-primary"
        )}
      >
        <Sparkle className="h-3.5 w-3.5" />
        Ask AI to filter
      </button>

      <Transition
        show={isOpen}
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <div className="shadow-lg absolute top-full left-0 z-20 mt-2 w-[28rem] max-w-[90vw] space-y-3 rounded-lg border border-subtle bg-surface-1 p-3">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              id="nl-assistant-root-query"
              name="nl-assistant-root-query"
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={fetchRecent}
              placeholder='Try "my urgent tickets overdue"'
              className="w-full rounded border-none bg-transparent px-2 py-1.5 text-13 outline-none placeholder:text-placeholder"
            />
            <Button type="submit" variant="primary" size="sm" loading={isSubmitting} disabled={!query.trim()}>
              Ask
            </Button>
          </form>

          {!result && !isSubmitting && recentQueries.length > 0 && (
            <div className="space-y-1 border-t border-subtle pt-2">
              <p className="text-11 text-tertiary">Recent</p>
              {recentQueries.map((recentQuery) => (
                <button
                  key={recentQuery.id}
                  type="button"
                  className="block w-full truncate rounded px-2 py-1 text-left text-13 text-secondary hover:bg-layer-2-hover"
                  onClick={() => handleRecentClick(recentQuery)}
                >
                  {recentQuery.raw_query}
                </button>
              ))}
            </div>
          )}

          {isSubmitting && (
            <Loader className="space-y-2">
              <Loader.Item height="16px" width="80%" />
              <Loader.Item height="28px" width="100%" />
            </Loader>
          )}

          {result && !isSubmitting && (
            <div className="space-y-2 border-t border-subtle pt-2">
              <p
                className={cn("text-13", {
                  "text-secondary": result.status === "success",
                  "text-warning-primary": result.status !== "success",
                })}
              >
                {result.restatement}
              </p>

              {result.unresolvedTerms.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 rounded bg-warning-subtle p-1.5 text-12 text-warning-primary">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  {result.unresolvedTerms.map((term) => (
                    <span key={term} className="rounded bg-surface-1 px-1.5 py-0.5">
                      {term}
                    </span>
                  ))}
                </div>
              )}

              {hasPreviewConditions && (
                <div className="flex flex-wrap items-center gap-2">
                  {previewFilter.allConditionsForDisplay.map((condition) => (
                    <FilterItem key={condition.id} filter={previewFilter} condition={condition} />
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={handleDiscard}>
                  Discard
                </Button>
                <Button variant="primary" size="sm" onClick={handleApply} disabled={!hasPreviewConditions}>
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </Transition>
    </div>
  );
});
