/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { TRoadmapProject } from "@plane/types";
// services
import { RoadmapService } from "@/services/roadmap.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IRoadmapStore {
  // loader
  loader: boolean;
  fetchedWorkspaces: Record<string, boolean>;
  // observables
  projectMap: Record<string, TRoadmapProject>;
  workspaceProjectIdsMap: Record<string, string[]>;

  // computed actions
  getWorkspaceProjectIds: (workspaceSlug: string) => string[] | null;
  getRoadmapProjectById: (projectId: string) => TRoadmapProject | null;

  // fetch
  fetchRoadmapProjects: (workspaceSlug: string) => Promise<TRoadmapProject[]>;
  // local mutation (after a successful PATCH .../projects/<id>/ from Gantt drag-resize)
  applyProjectDatesUpdate: (
    projectId: string,
    dates: { start_date?: string | null; target_date?: string | null }
  ) => void;
}

export class RoadmapStore implements IRoadmapStore {
  // observables
  loader: boolean = false;
  fetchedWorkspaces: Record<string, boolean> = {};
  projectMap: Record<string, TRoadmapProject> = {};
  workspaceProjectIdsMap: Record<string, string[]> = {};
  // root store
  rootStore;
  // services
  roadmapService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedWorkspaces: observable,
      projectMap: observable,
      workspaceProjectIdsMap: observable,

      fetchRoadmapProjects: action,
      applyProjectDatesUpdate: action,
    });

    this.rootStore = _rootStore;
    this.roadmapService = new RoadmapService();
  }

  getWorkspaceProjectIds = computedFn((workspaceSlug: string): string[] | null => {
    if (!this.fetchedWorkspaces[workspaceSlug]) return null;
    return this.workspaceProjectIdsMap[workspaceSlug] ?? [];
  });

  getRoadmapProjectById = computedFn(
    (projectId: string): TRoadmapProject | null => this.projectMap?.[projectId] ?? null
  );

  fetchRoadmapProjects = async (workspaceSlug: string) => {
    this.loader = true;
    try {
      const results = await this.roadmapService.list(workspaceSlug);
      runInAction(() => {
        results.forEach((project) => {
          set(this.projectMap, [project.id], project);
        });
        set(
          this.workspaceProjectIdsMap,
          [workspaceSlug],
          results.map((project) => project.id)
        );
        set(this.fetchedWorkspaces, workspaceSlug, true);
        this.loader = false;
      });
      return results;
    } catch (error) {
      this.loader = false;
      throw error;
    }
  };

  applyProjectDatesUpdate = (projectId: string, dates: { start_date?: string | null; target_date?: string | null }) => {
    const project = this.projectMap[projectId];
    if (!project) return;
    runInAction(() => {
      if (dates.start_date !== undefined) set(this.projectMap, [projectId, "start_date"], dates.start_date);
      if (dates.target_date !== undefined) set(this.projectMap, [projectId, "target_date"], dates.target_date);
    });
  };
}
