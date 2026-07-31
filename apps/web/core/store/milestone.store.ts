/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { IMilestone, IMilestoneIssue, TMilestoneWritePayload } from "@plane/types";
// services
import { MilestoneService } from "@/services/milestone.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IMilestoneStore {
  // loader
  loader: boolean;
  fetchedProjects: Record<string, boolean>;
  // observables
  milestoneMap: Record<string, IMilestone>;
  milestoneIssuesMap: Record<string, IMilestoneIssue[]>;

  // computed actions
  getProjectMilestoneIds: (projectId: string) => string[] | null;
  getMilestoneById: (milestoneId: string) => IMilestone | null;
  getMilestoneIssuesById: (milestoneId: string) => IMilestoneIssue[];

  // fetch
  fetchMilestones: (workspaceSlug: string, projectId: string) => Promise<IMilestone[]>;
  fetchMilestoneDetails: (workspaceSlug: string, projectId: string, milestoneId: string) => Promise<IMilestone>;
  fetchMilestoneIssues: (workspaceSlug: string, projectId: string, milestoneId: string) => Promise<IMilestoneIssue[]>;

  // crud
  createMilestone: (workspaceSlug: string, projectId: string, data: TMilestoneWritePayload) => Promise<IMilestone>;
  updateMilestone: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    data: TMilestoneWritePayload
  ) => Promise<IMilestone>;
  deleteMilestone: (workspaceSlug: string, projectId: string, milestoneId: string) => Promise<void>;
  attachIssuesToMilestone: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueIds: string[]
  ) => Promise<void>;
  detachIssueFromMilestone: (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueId: string
  ) => Promise<void>;
}

export class MilestoneStore implements IMilestoneStore {
  // observables
  loader: boolean = false;
  fetchedProjects: Record<string, boolean> = {};
  milestoneMap: Record<string, IMilestone> = {};
  milestoneIssuesMap: Record<string, IMilestoneIssue[]> = {};
  // root store
  rootStore;
  // services
  milestoneService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fetchedProjects: observable,
      milestoneMap: observable,
      milestoneIssuesMap: observable,

      fetchMilestones: action,
      fetchMilestoneDetails: action,
      fetchMilestoneIssues: action,
      createMilestone: action,
      updateMilestone: action,
      deleteMilestone: action,
      attachIssuesToMilestone: action,
      detachIssueFromMilestone: action,
    });

    this.rootStore = _rootStore;
    this.milestoneService = new MilestoneService();
  }

  getProjectMilestoneIds = computedFn((projectId: string): string[] | null => {
    if (!this.fetchedProjects[projectId]) return null;
    let milestones = Object.values(this.milestoneMap ?? {}).filter((m) => m.project_id === projectId);
    milestones = sortBy(milestones, [(m) => m.sort_order]);
    return milestones.map((m) => m.id);
  });

  getMilestoneById = computedFn((milestoneId: string): IMilestone | null => this.milestoneMap?.[milestoneId] ?? null);

  getMilestoneIssuesById = computedFn(
    (milestoneId: string): IMilestoneIssue[] => this.milestoneIssuesMap?.[milestoneId] ?? []
  );

  fetchMilestones = async (workspaceSlug: string, projectId: string) => {
    this.loader = true;
    try {
      const response = await this.milestoneService.getMilestones(workspaceSlug, projectId);
      runInAction(() => {
        response.forEach((milestone) => {
          set(this.milestoneMap, [milestone.id], milestone);
        });
        set(this.fetchedProjects, projectId, true);
        this.loader = false;
      });
      return response;
    } catch (error) {
      this.loader = false;
      throw error;
    }
  };

  fetchMilestoneDetails = async (workspaceSlug: string, projectId: string, milestoneId: string) => {
    const response = await this.milestoneService.getMilestoneDetails(workspaceSlug, projectId, milestoneId);
    runInAction(() => {
      set(this.milestoneMap, [milestoneId], response);
    });
    return response;
  };

  fetchMilestoneIssues = async (workspaceSlug: string, projectId: string, milestoneId: string) => {
    const response = await this.milestoneService.getMilestoneIssues(workspaceSlug, projectId, milestoneId);
    runInAction(() => {
      set(this.milestoneIssuesMap, [milestoneId], response);
    });
    return response;
  };

  createMilestone = async (workspaceSlug: string, projectId: string, data: TMilestoneWritePayload) => {
    const response = await this.milestoneService.createMilestone(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.milestoneMap, [response.id], response);
    });
    return response;
  };

  updateMilestone = async (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    data: TMilestoneWritePayload
  ) => {
    const before = this.milestoneMap[milestoneId];
    try {
      runInAction(() => {
        set(this.milestoneMap, [milestoneId], { ...before, ...data });
      });
      const response = await this.milestoneService.patchMilestone(workspaceSlug, projectId, milestoneId, data);
      runInAction(() => {
        set(this.milestoneMap, [milestoneId], response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (before) set(this.milestoneMap, [milestoneId], before);
      });
      throw error;
    }
  };

  deleteMilestone = async (workspaceSlug: string, projectId: string, milestoneId: string) => {
    await this.milestoneService.deleteMilestone(workspaceSlug, projectId, milestoneId);
    runInAction(() => {
      delete this.milestoneMap[milestoneId];
      delete this.milestoneIssuesMap[milestoneId];
    });
  };

  attachIssuesToMilestone = async (
    workspaceSlug: string,
    projectId: string,
    milestoneId: string,
    issueIds: string[]
  ) => {
    await this.milestoneService.attachIssuesToMilestone(workspaceSlug, projectId, milestoneId, issueIds);
    await this.fetchMilestoneIssues(workspaceSlug, projectId, milestoneId);
    await this.fetchMilestoneDetails(workspaceSlug, projectId, milestoneId);
  };

  detachIssueFromMilestone = async (workspaceSlug: string, projectId: string, milestoneId: string, issueId: string) => {
    await this.milestoneService.detachIssueFromMilestone(workspaceSlug, projectId, milestoneId, issueId);
    runInAction(() => {
      set(
        this.milestoneIssuesMap,
        [milestoneId],
        (this.milestoneIssuesMap[milestoneId] ?? []).filter((issue) => issue.id !== issueId)
      );
    });
    this.fetchMilestoneDetails(workspaceSlug, projectId, milestoneId);
  };
}
