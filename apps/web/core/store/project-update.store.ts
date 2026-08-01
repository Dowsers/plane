/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { IProjectUpdate, TProjectUpdateWritePayload } from "@plane/types";
// services
import { ProjectUpdateService } from "@/services/project-update.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IProjectUpdateStore {
  // loader
  loader: boolean;
  fetchedProjects: Record<string, boolean>;
  // observables
  updateMap: Record<string, IProjectUpdate>;
  projectUpdateIdsMap: Record<string, string[]>;

  // computed actions
  getProjectUpdateIds: (projectId: string) => string[] | null;
  getUpdateById: (updateId: string) => IProjectUpdate | null;

  // fetch
  fetchUpdates: (workspaceSlug: string, projectId: string) => Promise<IProjectUpdate[]>;

  // crud
  createUpdate: (workspaceSlug: string, projectId: string, data: TProjectUpdateWritePayload) => Promise<IProjectUpdate>;
  updateUpdate: (
    workspaceSlug: string,
    projectId: string,
    updateId: string,
    data: Partial<TProjectUpdateWritePayload>
  ) => Promise<IProjectUpdate>;
  deleteUpdate: (workspaceSlug: string, projectId: string, updateId: string) => Promise<void>;
}

export class ProjectUpdateStore implements IProjectUpdateStore {
  // observables
  loader: boolean = false;
  fetchedProjects: Record<string, boolean> = {};
  updateMap: Record<string, IProjectUpdate> = {};
  projectUpdateIdsMap: Record<string, string[]> = {};
  // root store
  rootStore;
  // services
  projectUpdateService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedProjects: observable,
      updateMap: observable,
      projectUpdateIdsMap: observable,

      fetchUpdates: action,
      createUpdate: action,
      updateUpdate: action,
      deleteUpdate: action,
    });

    this.rootStore = _rootStore;
    this.projectUpdateService = new ProjectUpdateService();
  }

  getProjectUpdateIds = computedFn((projectId: string): string[] | null => {
    if (!this.fetchedProjects[projectId]) return null;
    return this.projectUpdateIdsMap[projectId] ?? [];
  });

  getUpdateById = computedFn((updateId: string): IProjectUpdate | null => this.updateMap?.[updateId] ?? null);

  fetchUpdates = async (workspaceSlug: string, projectId: string) => {
    this.loader = true;
    try {
      const response = await this.projectUpdateService.list(workspaceSlug, projectId);
      const results: IProjectUpdate[] = response?.results ?? response ?? [];
      runInAction(() => {
        results.forEach((update) => {
          set(this.updateMap, [update.id], update);
        });
        set(
          this.projectUpdateIdsMap,
          [projectId],
          results.map((update) => update.id)
        );
        set(this.fetchedProjects, projectId, true);
        this.loader = false;
      });
      return results;
    } catch (error) {
      this.loader = false;
      throw error;
    }
  };

  createUpdate = async (workspaceSlug: string, projectId: string, data: TProjectUpdateWritePayload) => {
    const response = await this.projectUpdateService.create(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.updateMap, [response.id], response);
      set(this.projectUpdateIdsMap, [projectId], [response.id, ...(this.projectUpdateIdsMap[projectId] ?? [])]);
    });
    return response;
  };

  updateUpdate = async (
    workspaceSlug: string,
    projectId: string,
    updateId: string,
    data: Partial<TProjectUpdateWritePayload>
  ) => {
    const response = await this.projectUpdateService.update(workspaceSlug, projectId, updateId, data);
    runInAction(() => {
      set(this.updateMap, [updateId], response);
    });
    return response;
  };

  deleteUpdate = async (workspaceSlug: string, projectId: string, updateId: string) => {
    await this.projectUpdateService.remove(workspaceSlug, projectId, updateId);
    runInAction(() => {
      delete this.updateMap[updateId];
      set(
        this.projectUpdateIdsMap,
        [projectId],
        (this.projectUpdateIdsMap[projectId] ?? []).filter((id) => id !== updateId)
      );
    });
  };
}
