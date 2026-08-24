/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ChevronRight } from "lucide-react";
import { Command } from "cmdk";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { POWER_K_SEARCH_RESULTS_PAGE_SIZE } from "@plane/constants";
import type { IWorkspaceSearchResults } from "@plane/types";
// components
import type { TPowerKSearchResultsKeys } from "@/components/power-k/core/types";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// helpers
import { PowerKModalCommandItem } from "./command-item";
import { POWER_K_SEARCH_RESULTS_GROUPS_MAP } from "./search-results-map";

type Props = {
  closePalette: () => void;
  results: IWorkspaceSearchResults;
  // Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
  // plane-selfhost), feature 6 ("Recherche approfondie dans la Command
  // Palette"), exigence 3 - "Voir tous les resultats" plumbing. The actual
  // re-fetch (bigger `limit`, scoped to a single `types=<category>`) lives
  // in the parent (`search-menu.tsx`, which already owns `results` state
  // and the debounced query term) - this component only renders the
  // link/loading state and reports which category was clicked.
  onViewAllResults: (category: TPowerKSearchResultsKeys) => void;
  expandedCategories: Set<string>;
  loadingCategory: TPowerKSearchResultsKeys | null;
};

// Every pre-existing category's item carries both `id` and `name` - the two
// new ones (`issue_comment`, `member`) don't, using `comment_id`/`member_id`
// and `issue__name`/`display_name` instead (see
// `GlobalSearchEndpoint.filter_issue_comments`/`filter_members`,
// apps/api/plane/app/views/search/base.py), so a single generic `item.id`
// no longer holds for every category's item shape.
const getResultItemId = (item: any): string => item.id ?? item.comment_id ?? item.member_id;

export const PowerKModalSearchResults = observer(function PowerKModalSearchResults(props: Props) {
  const { closePalette, results, onViewAllResults, expandedCategories, loadingCategory } = props;
  // router
  const router = useAppRouter();
  const { projectId: routerProjectId, workspaceSlug: routerWorkspaceSlug } = useParams();
  // derived values
  const projectId = routerProjectId?.toString();
  const workspaceSlug = routerWorkspaceSlug?.toString();

  return (
    <>
      {Object.keys(results.results).map((key) => {
        const typedKey = key as TPowerKSearchResultsKeys;
        // Category 12, feature 6, exigence 10 - the backend now omits ANY
        // category with zero matches from `results` entirely (true for
        // every category, not just the two new ones), so `section` can be
        // `undefined` even for a key that IS present in the object (a
        // stale/narrower TS view isn't enough - guard defensively).
        const section = results.results[typedKey as keyof typeof results.results];
        const currentSection = POWER_K_SEARCH_RESULTS_GROUPS_MAP[typedKey];

        if (!currentSection) return null;
        if (!section || section.length <= 0) return null;

        // A category page exactly `POWER_K_SEARCH_RESULTS_PAGE_SIZE` (5)
        // long is the backend's own documented signal that there may be
        // more (`GlobalSearchEndpoint.get`'s pagination contract
        // docstring). Once a category has already been expanded once (see
        // `onViewAllResults`), don't show the link again even if the
        // expanded page also happens to be exactly that long (a real, if
        // rare, edge case: a category with exactly 5 total matches).
        const canShowViewAll = section.length === POWER_K_SEARCH_RESULTS_PAGE_SIZE && !expandedCategories.has(key);
        const isLoadingMore = loadingCategory === typedKey;

        return (
          <Command.Group key={key} heading={currentSection.title}>
            {section.map((item) => {
              const itemId = getResultItemId(item);
              let value = `${key}-${itemId}`;

              if ("name" in item && item.name) value = `${value}-${item.name}`;
              if ("project__identifier" in item) value = `${value}-${item.project__identifier}`;
              if ("sequence_id" in item) value = `${value}-${item.sequence_id}`;
              if ("issue__name" in item) value = `${value}-${item.issue__name}`;
              if ("issue__sequence_id" in item) value = `${value}-${item.issue__sequence_id}`;
              if ("display_name" in item) value = `${value}-${item.display_name}`;
              if ("email" in item) value = `${value}-${item.email}`;
              // The searched term only literally appears in `name` for a
              // title match - for a description/comment match (or an
              // accent-widened match - see `ImmutableUnaccent` on the
              // backend), the term instead sits inside `snippet.text`.
              // Without this, the Power-K modal's own client-side re-filter
              // (`ProjectsAppPowerKModalWrapper`'s custom `Command`
              // `filter`, wrapper.tsx) would hide an item the backend
              // legitimately returned, as soon as the user's keystrokes
              // outrun the debounce.
              if ("snippet" in item && item.snippet?.text) value = `${value}-${item.snippet.text}`;

              return (
                <PowerKModalCommandItem
                  key={itemId}
                  label={currentSection.itemName(item)}
                  icon={currentSection.icon}
                  iconNode={currentSection.renderIcon?.(item)}
                  onSelect={() => {
                    closePalette();
                    router.push(currentSection.path(item, projectId, workspaceSlug));
                  }}
                  value={value}
                />
              );
            })}
            {canShowViewAll && (
              <PowerKModalCommandItem
                key={`${key}-view-all`}
                label={isLoadingMore ? "Loading more results…" : "View all results"}
                iconNode={<ChevronRight className="size-3.5 shrink-0 text-tertiary" />}
                isDisabled={isLoadingMore}
                onSelect={() => onViewAllResults(typedKey)}
                value={`${key}-view-all`}
              />
            )}
          </Command.Group>
        );
      })}
    </>
  );
});
