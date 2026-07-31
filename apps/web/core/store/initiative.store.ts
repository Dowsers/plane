/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { IInitiative, IInitiativeActivity, IInitiativeProject, TInitiativeWritePayload } from "@plane/types";
// services
import { InitiativeService } from "@/services/initiative.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IInitiativeStore {
  // loader
  loader: boolean;
  fetchedWorkspaces: Record<string, boolean>;
  // observables
  initiativeMap: Record<string, IInitiative>;
  initiativeProjectsMap: Record<string, IInitiativeProject[]>;
  initiativeActivitiesMap: Record<string, IInitiativeActivity[]>;

  // computed actions
  getInitiativeIds: (workspaceSlug: string) => string[] | null;
  getInitiativeById: (initiativeId: string) => IInitiative | null;
  getInitiativeProjectsById: (initiativeId: string) => IInitiativeProject[];
  getInitiativeActivitiesById: (initiativeId: string) => IInitiativeActivity[];

  // fetch
  fetchInitiatives: (workspaceSlug: string) => Promise<IInitiative[]>;
  fetchInitiativeDetails: (workspaceSlug: string, initiativeId: string) => Promise<IInitiative>;
  fetchInitiativeProjects: (workspaceSlug: string, initiativeId: string) => Promise<IInitiativeProject[]>;
  fetchInitiativeActivities: (workspaceSlug: string, initiativeId: string) => Promise<IInitiativeActivity[]>;

  // crud
  createInitiative: (workspaceSlug: string, data: TInitiativeWritePayload) => Promise<IInitiative>;
  updateInitiative: (
    workspaceSlug: string,
    initiativeId: string,
    data: TInitiativeWritePayload
  ) => Promise<IInitiative>;
  deleteInitiative: (workspaceSlug: string, initiativeId: string) => Promise<void>;
  linkProjectsToInitiative: (workspaceSlug: string, initiativeId: string, projectIds: string[]) => Promise<void>;
  unlinkProjectFromInitiative: (workspaceSlug: string, initiativeId: string, projectId: string) => Promise<void>;
}

export class InitiativeStore implements IInitiativeStore {
  // observables
  loader: boolean = false;
  fetchedWorkspaces: Record<string, boolean> = {};
  initiativeMap: Record<string, IInitiative> = {};
  initiativeProjectsMap: Record<string, IInitiativeProject[]> = {};
  initiativeActivitiesMap: Record<string, IInitiativeActivity[]> = {};
  // root store
  rootStore;
  // services
  initiativeService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedWorkspaces: observable,
      initiativeMap: observable,
      initiativeProjectsMap: observable,
      initiativeActivitiesMap: observable,

      fetchInitiatives: action,
      fetchInitiativeDetails: action,
      fetchInitiativeProjects: action,
      fetchInitiativeActivities: action,
      createInitiative: action,
      updateInitiative: action,
      deleteInitiative: action,
      linkProjectsToInitiative: action,
      unlinkProjectFromInitiative: action,
    });

    this.rootStore = _rootStore;
    this.initiativeService = new InitiativeService();
  }

  /**
   * @description returns all initiative ids for a workspace, sorted by sort_order
   */
  getInitiativeIds = computedFn((workspaceSlug: string): string[] | null => {
    if (!this.fetchedWorkspaces[workspaceSlug]) return null;
    let initiatives = Object.values(this.initiativeMap ?? {});
    initiatives = sortBy(initiatives, [(i) => i.sort_order]);
    return initiatives.map((i) => i.id);
  });

  getInitiativeById = computedFn(
    (initiativeId: string): IInitiative | null => this.initiativeMap?.[initiativeId] ?? null
  );

  getInitiativeProjectsById = computedFn(
    (initiativeId: string): IInitiativeProject[] => this.initiativeProjectsMap?.[initiativeId] ?? []
  );

  getInitiativeActivitiesById = computedFn(
    (initiativeId: string): IInitiativeActivity[] => this.initiativeActivitiesMap?.[initiativeId] ?? []
  );

  fetchInitiatives = async (workspaceSlug: string) => {
    this.loader = true;
    try {
      const response = await this.initiativeService.getInitiatives(workspaceSlug);
      runInAction(() => {
        response.forEach((initiative) => {
          set(this.initiativeMap, [initiative.id], initiative);
        });
        set(this.fetchedWorkspaces, workspaceSlug, true);
        this.loader = false;
      });
      return response;
    } catch (error) {
      this.loader = false;
      throw error;
    }
  };

  fetchInitiativeDetails = async (workspaceSlug: string, initiativeId: string) => {
    const response = await this.initiativeService.getInitiativeDetails(workspaceSlug, initiativeId);
    runInAction(() => {
      set(this.initiativeMap, [initiativeId], response);
    });
    return response;
  };

  fetchInitiativeProjects = async (workspaceSlug: string, initiativeId: string) => {
    const response = await this.initiativeService.getInitiativeProjects(workspaceSlug, initiativeId);
    runInAction(() => {
      set(this.initiativeProjectsMap, [initiativeId], response);
    });
    return response;
  };

  fetchInitiativeActivities = async (workspaceSlug: string, initiativeId: string) => {
    const response = await this.initiativeService.getInitiativeActivities(workspaceSlug, initiativeId);
    runInAction(() => {
      set(this.initiativeActivitiesMap, [initiativeId], response);
    });
    return response;
  };

  createInitiative = async (workspaceSlug: string, data: TInitiativeWritePayload) => {
    const response = await this.initiativeService.createInitiative(workspaceSlug, data);
    runInAction(() => {
      set(this.initiativeMap, [response.id], response);
    });
    return response;
  };

  updateInitiative = async (workspaceSlug: string, initiativeId: string, data: TInitiativeWritePayload) => {
    const before = this.initiativeMap[initiativeId];
    try {
      runInAction(() => {
        set(this.initiativeMap, [initiativeId], { ...before, ...data });
      });
      const response = await this.initiativeService.patchInitiative(workspaceSlug, initiativeId, data);
      runInAction(() => {
        set(this.initiativeMap, [initiativeId], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (before) set(this.initiativeMap, [initiativeId], before);
      });
      throw error;
    }
  };

  deleteInitiative = async (workspaceSlug: string, initiativeId: string) => {
    await this.initiativeService.deleteInitiative(workspaceSlug, initiativeId);
    runInAction(() => {
      delete this.initiativeMap[initiativeId];
      delete this.initiativeProjectsMap[initiativeId];
      delete this.initiativeActivitiesMap[initiativeId];
    });
  };

  linkProjectsToInitiative = async (workspaceSlug: string, initiativeId: string, projectIds: string[]) => {
    const response = await this.initiativeService.linkProjectsToInitiative(workspaceSlug, initiativeId, projectIds);
    runInAction(() => {
      set(this.initiativeProjectsMap, [initiativeId], response);
    });
    this.fetchInitiativeDetails(workspaceSlug, initiativeId);
  };

  unlinkProjectFromInitiative = async (workspaceSlug: string, initiativeId: string, projectId: string) => {
    await this.initiativeService.unlinkProjectFromInitiative(workspaceSlug, initiativeId, projectId);
    runInAction(() => {
      set(
        this.initiativeProjectsMap,
        [initiativeId],
        (this.initiativeProjectsMap[initiativeId] ?? []).filter((link) => link.project_id !== projectId)
      );
    });
    this.fetchInitiativeDetails(workspaceSlug, initiativeId);
  };
}
