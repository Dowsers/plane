/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useEffect, useCallback } from "react";
import { WifiOff } from "lucide-react";
import { useParams } from "next/navigation";
// plane imports
import { POWER_K_SEARCH_RESULTS_EXPANDED_PAGE_SIZE, WORKSPACE_DEFAULT_SEARCH_RESULT } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IWorkspaceSearchResults } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { usePowerK } from "@/hooks/store/use-power-k";
import { useSyncEngine } from "@/hooks/store/use-sync-engine";
import useDebounce from "@/hooks/use-debounce";
// plane web imports
import { PowerKModalNoSearchResultsCommand } from "@/plane-web/components/command-palette/power-k/search/no-results-command";
import { WorkspaceService } from "@/services/workspace.service";
// local imports
import type { TPowerKContext, TPowerKPageType, TPowerKSearchResultsKeys } from "../../core/types";
import { PowerKModalSearchResults } from "./search-results";
// services init
const workspaceService = new WorkspaceService();

type Props = {
  activePage: TPowerKPageType | null;
  context: TPowerKContext;
  isWorkspaceLevel: boolean;
  searchTerm: string;
  updateSearchTerm: (value: string) => void;
  handleSearchMenuClose?: () => void;
};

export function PowerKModalSearchMenu(props: Props) {
  const { activePage, context, isWorkspaceLevel, searchTerm, updateSearchTerm, handleSearchMenuClose } = props;
  // states
  const [resultsCount, setResultsCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<IWorkspaceSearchResults>(WORKSPACE_DEFAULT_SEARCH_RESULT);
  // Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
  // plane-selfhost), feature 6 ("Recherche approfondie dans la Command
  // Palette"), exigence 3 - "Voir tous les resultats" state: which
  // categories have already been expanded past the default page size (5),
  // reset on every new search, and which one (if any) is mid-fetch.
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [loadingCategory, setLoadingCategory] = useState<TPowerKSearchResultsKeys | null>(null);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  // navigation
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { togglePowerKModal } = usePowerK();
  const { t } = useTranslation();
  // Category 12, feature 4 (docs/feature-specs/12-keyboard-mobile-
  // desktop.md in plane-selfhost), exigence 13 - "recherche globale
  // plein-texte cote serveur" is exactly the kind of action this exigence
  // names as genuinely requiring the server; gated on `isFeatureEnabled`
  // like every other piece of this feature (fully dormant unless the
  // workspace's "Mode hors ligne (beta)" toggle is on) so this never
  // changes behavior for a workspace that hasn't opted in.
  const { isFeatureEnabled: isOfflineSyncFeatureEnabled, isOnline } = useSyncEngine();
  const isSearchUnavailableOffline = isOfflineSyncFeatureEnabled && !isOnline;

  useEffect(() => {
    if (activePage || !workspaceSlug) return;
    setExpandedCategories(new Set());

    if (isSearchUnavailableOffline) {
      // Don't even attempt the request - it would just fail after a
      // round trip. Leave results empty; the dedicated offline message
      // below (rather than the generic "no results" empty state) is what
      // actually renders in this case.
      setResults(WORKSPACE_DEFAULT_SEARCH_RESULT);
      setResultsCount(0);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    if (debouncedSearchTerm) {
      workspaceService
        .searchWorkspace(workspaceSlug.toString(), {
          ...(projectId ? { project_id: projectId.toString() } : {}),
          search: debouncedSearchTerm,
          workspace_search: !projectId ? true : isWorkspaceLevel,
        })
        .then((response) => {
          setResults(response);
          const count = Object.keys(response.results).reduce(
            (accumulator, key) => (response.results[key as keyof typeof response.results]?.length ?? 0) + accumulator,
            0
          );
          setResultsCount(count);
          return count;
        })
        .catch(() => {
          setResults(WORKSPACE_DEFAULT_SEARCH_RESULT);
          setResultsCount(0);
        })
        .finally(() => setIsSearching(false));
    } else {
      setResults(WORKSPACE_DEFAULT_SEARCH_RESULT);
      setIsSearching(false);
    }
  }, [debouncedSearchTerm, isWorkspaceLevel, projectId, workspaceSlug, activePage, isSearchUnavailableOffline]);

  // Category 12, feature 6, exigence 3 - re-queries the SAME debounced
  // term, scoped to a single category (`types=<category>`) with a bigger
  // `limit`, then replaces just that category's slice of `results` in
  // place; every other category's already-rendered results are untouched.
  const handleViewAllResults = useCallback(
    (category: TPowerKSearchResultsKeys) => {
      if (!workspaceSlug || !debouncedSearchTerm || isSearchUnavailableOffline) return;
      setLoadingCategory(category);
      workspaceService
        .searchWorkspace(workspaceSlug.toString(), {
          ...(projectId ? { project_id: projectId.toString() } : {}),
          search: debouncedSearchTerm,
          workspace_search: !projectId ? true : isWorkspaceLevel,
          types: category,
          limit: POWER_K_SEARCH_RESULTS_EXPANDED_PAGE_SIZE,
        })
        .then((expanded) => {
          setResults((previous) => ({
            results: {
              ...previous.results,
              [category]: expanded.results[category as keyof typeof expanded.results] ?? [],
            },
          }));
          setExpandedCategories((previous) => new Set(previous).add(category));
          return expanded;
        })
        .catch(() => {
          // Leave the existing (capped) results in place on failure.
        })
        .finally(() => setLoadingCategory(null));
    },
    [workspaceSlug, projectId, debouncedSearchTerm, isWorkspaceLevel, isSearchUnavailableOffline]
  );

  if (activePage) return null;

  const handleClosePalette = () => {
    handleSearchMenuClose?.();
    togglePowerKModal(false);
  };

  return (
    <>
      {searchTerm.trim() !== "" && (
        <div className="mt-4 flex items-center justify-between gap-2 px-4">
          <h5
            className={cn("text-11 text-primary", {
              "animate-pulse": isSearching,
            })}
          >
            Search results for{" "}
            <span className="font-medium">
              {'"'}
              {searchTerm}
              {'"'}
            </span>{" "}
            in {isWorkspaceLevel ? "workspace" : "project"}:
          </h5>
        </div>
      )}

      {/* Category 12, feature 4, exigence 13 - distinct from the generic
          "no results" empty state below: while genuinely offline, there
          simply IS no result to report either way, so say that plainly
          instead of implying the search actually ran and found nothing. */}
      {isSearchUnavailableOffline && searchTerm.trim() !== "" && debouncedSearchTerm.trim() !== "" && (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <WifiOff className="size-5 text-tertiary" />
          <p className="text-13 text-secondary">{t("offline_sync.requires_connection")}</p>
        </div>
      )}

      {/* Show empty state only when not loading and no results */}
      {!isSearchUnavailableOffline &&
        !isSearching &&
        resultsCount === 0 &&
        searchTerm.trim() !== "" &&
        debouncedSearchTerm.trim() !== "" && (
          <PowerKModalNoSearchResultsCommand
            context={context}
            searchTerm={searchTerm}
            updateSearchTerm={updateSearchTerm}
          />
        )}

      {searchTerm.trim() !== "" && (
        <PowerKModalSearchResults
          closePalette={handleClosePalette}
          results={results}
          onViewAllResults={handleViewAllResults}
          expandedCategories={expandedCategories}
          loadingCategory={loadingCategory}
        />
      )}
    </>
  );
}
