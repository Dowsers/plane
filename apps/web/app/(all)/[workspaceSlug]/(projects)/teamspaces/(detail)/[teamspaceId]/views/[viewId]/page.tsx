/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useContext, useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import type { TIssue } from "@plane/types";
// components
import { PageHead } from "@/components/core/page-title";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { SpreadsheetView } from "@/components/issues/issue-layouts/spreadsheet/spreadsheet-view";
import { SpreadsheetLayoutLoader } from "@/components/ui/loader/layouts/spreadsheet-layout-loader";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";
// services
import { WorkspaceService } from "@/services/workspace.service";
// store
import { StoreContext } from "@/lib/store-context";
import type { Route } from "./+types/page";

const workspaceService = new WorkspaceService();

function TeamspaceViewIssuesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, teamspaceId, viewId } = params;
  // store hooks
  const rootStore = useContext(StoreContext);
  const { currentWorkspace } = useWorkspace();
  const { getTeamspaceProjectsById, getTeamspaceViewsById, fetchTeamspaceDetails, fetchTeamspaceViews } =
    useTeamspace();

  const view = getTeamspaceViewsById(teamspaceId).find((v) => v.id === viewId);
  const pageTitle = currentWorkspace?.name && view?.name ? `${currentWorkspace.name} - ${view.name}` : undefined;

  // labels/cycles/modules/estimates the spreadsheet's property columns read from
  useWorkspaceIssueProperties(workspaceSlug);

  // ensure the teamspace's project list and views are loaded, even on a direct deep link
  useSWR(
    workspaceSlug && teamspaceId ? ["TEAMSPACE_VIEW_DETAILS", workspaceSlug, teamspaceId] : null,
    workspaceSlug && teamspaceId ? () => fetchTeamspaceDetails(workspaceSlug, teamspaceId) : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    workspaceSlug && teamspaceId ? ["TEAMSPACE_VIEWS", workspaceSlug, teamspaceId] : null,
    workspaceSlug && teamspaceId ? () => fetchTeamspaceViews(workspaceSlug, teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const projectIdsKey = getTeamspaceProjectsById(teamspaceId)
    .map((project) => project.project)
    .join(",");

  const { data, isLoading } = useSWR(
    workspaceSlug && teamspaceId && projectIdsKey
      ? ["TEAMSPACE_VIEW_ISSUES", workspaceSlug, teamspaceId, projectIdsKey]
      : null,
    workspaceSlug && projectIdsKey
      ? () => workspaceService.getViewIssues(workspaceSlug, { project_id__in: projectIdsKey })
      : null,
    { revalidateOnFocus: false }
  );

  // WorkspaceViewIssuesViewSet.list (apps/api/plane/app/views/view/base.py) has no group_by
  // handling, so results is always a flat, ungrouped array for this endpoint.
  const issues = useMemo<TIssue[]>(() => (Array.isArray(data?.results) ? data.results : []), [data]);
  const issueIds = useMemo(() => issues.map((issue) => issue.id), [issues]);

  useEffect(() => {
    if (issues.length > 0) rootStore.issue.issues.addIssue(issues);
  }, [issues, rootStore]);

  const canEditProperties = useCallback(() => false, []);
  const renderQuickActions = useCallback(() => null, []);
  const handleDisplayFilterUpdate = useCallback(() => {}, []);
  const loadMoreIssues = useCallback(() => {}, []);

  if (isLoading && issueIds.length === 0) {
    return <SpreadsheetLayoutLoader />;
  }

  if (!isLoading && issueIds.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-13 text-secondary">No work items found in this teamspace&apos;s projects.</p>
      </div>
    );
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full overflow-hidden bg-surface-1">
        <div className="flex h-full w-full flex-col border-b border-strong">
          <SpreadsheetView
            displayProperties={{}}
            displayFilters={{}}
            handleDisplayFilterUpdate={handleDisplayFilterUpdate}
            issueIds={issueIds}
            quickActions={renderQuickActions}
            updateIssue={undefined}
            canEditProperties={canEditProperties}
            canLoadMoreIssues={false}
            loadMoreIssues={loadMoreIssues}
            isWorkspaceLevel
          />
        </div>
        <IssuePeekOverview />
      </div>
    </>
  );
}

export default observer(TeamspaceViewIssuesPage);
