/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { GLOBAL_VIEW_TRACKER_ELEMENTS, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import type { EIssueLayoutTypes, TWorkItemFilterExpression } from "@plane/types";
import { EIssuesStoreType, LOGICAL_OPERATOR, STATIC_VIEW_TYPES, WORK_ITEM_FILTER_PROPERTY_KEYS } from "@plane/types";
// assets
// components
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { WorkspaceActiveLayout } from "@/components/views/helper";
import { WorkspaceLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/workspace-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
// hooks
import { useGlobalView } from "@/hooks/store/use-global-view";
import { useIssues } from "@/hooks/store/use-issues";
import { useAppRouter } from "@/hooks/use-app-router";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";

type Props = {
  isDefaultView: boolean;
  isLoading?: boolean;
  toggleLoading: (value: boolean) => void;
};

/**
 * Builds a filter expression out of `<property>__<operator>` query params, e.g.
 * `?priority__in=urgent,high` or `?target_date__exact=2025-01-30`. Lets another
 * surface deep-link into this view pre-filtered (the teamspace overview chart
 * does, on bar click).
 *
 * Params that aren't a valid condition key over a known work item filter
 * property are skipped, so unrelated ones (peek ids, tracking) pass through
 * without reaching - and being logged as invalid by - the filter adapter.
 * Comma-separated lists are left as-is: the adapter splits them itself for
 * multi-value operators.
 */
const buildRouteFilterExpression = (routeFilters: { [key: string]: string }): TWorkItemFilterExpression | undefined => {
  const conditions = Object.entries(routeFilters).flatMap(([key, value]) => {
    const separatorIndex = key.lastIndexOf("__");
    // Mirrors the adapter's own condition-key validation: a non-empty property
    // before the separator and a non-empty operator after it.
    if (separatorIndex <= 0 || separatorIndex === key.length - 2) return [];
    const property = key.slice(0, separatorIndex);
    const isKnownProperty =
      WORK_ITEM_FILTER_PROPERTY_KEYS.includes(property as (typeof WORK_ITEM_FILTER_PROPERTY_KEYS)[number]) ||
      property.startsWith("customproperty_");
    if (!isKnownProperty || !value) return [];
    return [{ [key]: value }];
  });

  return conditions.length > 0 ? ({ [LOGICAL_OPERATOR.AND]: conditions } as TWorkItemFilterExpression) : undefined;
};

export const AllIssueLayoutRoot = observer(function AllIssueLayoutRoot(props: Props) {
  const { isDefaultView, isLoading = false, toggleLoading } = props;
  // hooks
  const { t } = useTranslation();
  // router
  const router = useAppRouter();
  const { workspaceSlug: routerWorkspaceSlug, globalViewId: routerGlobalViewId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const globalViewId = routerGlobalViewId ? routerGlobalViewId.toString() : undefined;
  // search params
  const searchParams = useSearchParams();
  // store hooks
  const {
    issuesFilter: { filters, fetchFilters, updateFilterExpression },
    issues: { clear, groupedIssueIds, fetchIssues, fetchNextIssues },
  } = useIssues(EIssuesStoreType.GLOBAL);
  const { fetchAllGlobalViews, getViewDetailsById } = useGlobalView();
  // Derived values
  const viewDetails = globalViewId ? getViewDetailsById(globalViewId) : undefined;
  const workItemFilters = globalViewId ? filters?.[globalViewId] : undefined;
  const activeLayout: EIssueLayoutTypes | undefined = workItemFilters?.displayFilters?.layout;

  // Route filters
  const routeFilters: { [key: string]: string } = useMemo(() => {
    const filtersFromRoute: { [key: string]: string } = {};
    searchParams.forEach((value: string, key: string) => {
      filtersFromRoute[key] = value;
    });
    return filtersFromRoute;
  }, [searchParams]);

  // A deep link's filters win over the view's saved ones - arriving on
  // `?priority__in=urgent` has to show urgent work items, not whatever the
  // view was last saved with. Seeds both the filter UI (via
  // `initialWorkItemFilters`) and the store the work item fetch reads from
  // (via `fetchFilters`) - seeding only the former leaves the filter showing
  // in the UI while the fetched results ignore it.
  const routeFilterExpression = useMemo(() => buildRouteFilterExpression(routeFilters), [routeFilters]);

  // Determine initial work item filters based on view type and availability
  const initialWorkItemFilters = useMemo(() => {
    if (!globalViewId) return undefined;

    const isStaticView = STATIC_VIEW_TYPES.includes(globalViewId);
    const hasViewDetails = Boolean(viewDetails);

    if (!isStaticView && !hasViewDetails) return undefined;

    return {
      displayFilters: workItemFilters?.displayFilters,
      displayProperties: workItemFilters?.displayProperties,
      kanbanFilters: workItemFilters?.kanbanFilters,
      richFilters: routeFilterExpression ?? viewDetails?.rich_filters ?? {},
    };
  }, [globalViewId, viewDetails, workItemFilters, routeFilterExpression]);

  // Custom hooks
  useWorkspaceIssueProperties(workspaceSlug);

  // Fetch next pages callback
  const fetchNextPages = useCallback(() => {
    if (workspaceSlug && globalViewId) fetchNextIssues(workspaceSlug, globalViewId);
  }, [fetchNextIssues, workspaceSlug, globalViewId]);

  // Fetch global views
  const { isLoading: globalViewsLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_GLOBAL_VIEWS_${workspaceSlug}` : null,
    async () => {
      if (workspaceSlug) {
        await fetchAllGlobalViews(workspaceSlug);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // Fetch issues
  const { isLoading: issuesLoading } = useSWR(
    workspaceSlug && globalViewId
      ? // Keyed on the route filters too, so landing on the same view with a
        // different `?priority__in=` refetches instead of serving the previous
        // group's results.
        `WORKSPACE_GLOBAL_VIEW_ISSUES_${workspaceSlug}_${globalViewId}_${searchParams.toString()}`
      : null,
    async () => {
      if (workspaceSlug && globalViewId) {
        clear();
        toggleLoading(true);
        await fetchFilters(workspaceSlug, globalViewId, routeFilterExpression);
        await fetchIssues(workspaceSlug, globalViewId, groupedIssueIds ? "mutation" : "init-loader", {
          canGroup: false,
          perPageCount: 100,
        });
        toggleLoading(false);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // Empty state
  if (!isLoading && !globalViewsLoading && !issuesLoading && !viewDetails && !isDefaultView) {
    return (
      <EmptyStateDetailed
        title={t("issue_view.all_issue_layout_root.view_not_found.title")}
        description={t("issue_view.all_issue_layout_root.view_not_found.description")}
        assetKey="view"
        actions={[
          {
            label: t("issue_view.all_issue_layout_root.view_not_found.cta"),
            onClick: () => router.push(`/${workspaceSlug}/workspace-views/all-issues`),
            variant: "primary",
          },
        ]}
      />
    );
  }

  if (!workspaceSlug || !globalViewId) return null;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.GLOBAL}>
      <WorkspaceLevelWorkItemFiltersHOC
        enableSaveView
        saveViewOptions={{
          label: t("issue_view.all_issue_layout_root.save_as"),
        }}
        enableUpdateView
        entityId={globalViewId}
        entityType={EIssuesStoreType.GLOBAL}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.my_issues.filters}
        initialWorkItemFilters={initialWorkItemFilters}
        updateFilters={updateFilterExpression.bind(updateFilterExpression, workspaceSlug, globalViewId)}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: globalWorkItemsFilter }) => (
          <div className="h-full overflow-hidden bg-surface-1">
            <div className="flex h-full w-full flex-col border-b border-strong">
              {globalWorkItemsFilter && (
                <WorkItemFiltersRow
                  filter={globalWorkItemsFilter}
                  trackerElements={{
                    saveView: GLOBAL_VIEW_TRACKER_ELEMENTS.HEADER_SAVE_VIEW_BUTTON,
                  }}
                />
              )}
              <WorkspaceActiveLayout
                activeLayout={activeLayout}
                isDefaultView={isDefaultView}
                isLoading={isLoading}
                toggleLoading={toggleLoading}
                workspaceSlug={workspaceSlug}
                globalViewId={globalViewId}
                routeFilters={routeFilters}
                fetchNextPages={fetchNextPages}
                globalViewsLoading={globalViewsLoading}
                issuesLoading={issuesLoading}
              />
            </div>
            {/* peek overview */}
            <IssuePeekOverview />
          </div>
        )}
      </WorkspaceLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
