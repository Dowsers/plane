/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Outlet } from "react-router";
// plane imports
import { Header, Row } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { TabNavigationRoot } from "@/components/navigation/tab-navigation-root";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useSyncEngine } from "@/hooks/store/use-sync-engine";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";
// layouts
import { ProjectAuthWrapper } from "@/layouts/auth-layout/project-wrapper";
// local imports
import type { Route } from "./+types/layout";

function ProjectLayout({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  const syncEngine = useSyncEngine();
  // preferences
  const { preferences: projectPreferences } = useProjectNavigationPreferences();

  // Category 12, feature 4 data-integrity review fix - exigence 13's LRU
  // quota eviction (`evictLeastRecentlyViewedProjects` in
  // `packages/sync-engine/src/cache.ts`) is entirely driven by
  // `project_lru` rows that ONLY `touchProject` ever writes - and until
  // this fix, nothing in the app ever called it, so the eviction pass
  // always found zero candidates and never freed any space regardless of
  // how far over quota the cache grew. This layout wraps every project
  // sub-route (issues/cycles/modules/pages/...), so it's the one real
  // mount point that reliably fires on every "the user is now looking at
  // project X" transition - a no-op (see `SyncEngineStore.touchProject`
  // -> `postToWorker`) when offline sync is disabled or not yet booted.
  useEffect(() => {
    if (projectId) syncEngine.touchProject(projectId);
  }, [projectId, syncEngine]);

  return (
    <>
      {projectPreferences.navigationMode === "TABBED" && (
        <div className="z-20">
          <Row className="flex h-header w-full items-center gap-2 border-b border-subtle bg-surface-1">
            <div className="flex h-full w-full items-center gap-2 divide-x divide-subtle">
              <div className="flex size-full flex-1 items-center gap-2">
                {sidebarCollapsed && (
                  <div className="shrink-0">
                    <AppSidebarToggleButton />
                  </div>
                )}
                <Header className={cn("h-full", { "pl-1.5": !sidebarCollapsed })}>
                  <Header.LeftItem className="flex h-full max-w-full items-center gap-2">
                    <TabNavigationRoot workspaceSlug={workspaceSlug} projectId={projectId} />
                  </Header.LeftItem>
                </Header>
              </div>
            </div>
          </Row>
        </div>
      )}
      <ProjectAuthWrapper workspaceSlug={workspaceSlug} projectId={projectId}>
        <Outlet />
      </ProjectAuthWrapper>
    </>
  );
}

export default observer(ProjectLayout);
