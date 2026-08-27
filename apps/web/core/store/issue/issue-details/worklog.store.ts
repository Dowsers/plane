/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { pull, concat, uniq, set, sumBy, update } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// Plane Imports
import type { TIssueWorklog, TIssueWorklogMap, TIssueWorklogIdMap } from "@plane/types";
// services
import { IssueWorklogService } from "@/services/issue";
// types
import type { IIssueDetail } from "./root.store";

export type TWorklogLoader = "fetch" | "create" | "update" | "delete" | "mutate" | undefined;

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 1 "Saisie de temps par work item") in plane-selfhost.
 * Mirrors IssueCommentStore (comment.store.ts), stripped of the Category
 * 12 offline-sync-engine plumbing (`mergeFromSync`/`isNetworkFailure`) -
 * worklog offline support isn't in scope for this feature.
 */
export interface IIssueWorklogStoreActions {
  fetchWorklogs: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueWorklog[]>;
  createWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueWorklog>
  ) => Promise<TIssueWorklog>;
  updateWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<TIssueWorklog>
  ) => Promise<TIssueWorklog>;
  removeWorklog: (workspaceSlug: string, projectId: string, issueId: string, worklogId: string) => Promise<void>;
}

export interface IIssueWorklogStore extends IIssueWorklogStoreActions {
  // observables
  loader: TWorklogLoader;
  worklogs: TIssueWorklogIdMap;
  worklogMap: TIssueWorklogMap;
  // helper methods
  getWorklogsByIssueId: (issueId: string) => string[] | undefined;
  getWorklogById: (worklogId: string) => TIssueWorklog | undefined;
  getTotalWorklogDurationByIssueId: (issueId: string) => number;
}

export class IssueWorklogStore implements IIssueWorklogStore {
  // observables
  loader: TWorklogLoader = "fetch";
  worklogs: TIssueWorklogIdMap = {};
  worklogMap: TIssueWorklogMap = {};
  // root store
  rootIssueDetail: IIssueDetail;
  // services
  issueWorklogService;

  constructor(rootStore: IIssueDetail) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      worklogs: observable,
      worklogMap: observable,
      // actions
      fetchWorklogs: action,
      createWorklog: action,
      updateWorklog: action,
      removeWorklog: action,
    });
    this.rootIssueDetail = rootStore;
    this.issueWorklogService = new IssueWorklogService();
  }

  // helper methods
  getWorklogsByIssueId = (issueId: string) => {
    if (!issueId) return undefined;
    return this.worklogs[issueId] ?? undefined;
  };

  getWorklogById = (worklogId: string) => {
    if (!worklogId) return undefined;
    return this.worklogMap[worklogId] ?? undefined;
  };

  getTotalWorklogDurationByIssueId = computedFn((issueId: string) => {
    const worklogIds = this.getWorklogsByIssueId(issueId);
    if (!worklogIds) return 0;
    return sumBy(worklogIds, (id) => this.worklogMap[id]?.duration ?? 0);
  });

  fetchWorklogs = async (workspaceSlug: string, projectId: string, issueId: string) => {
    this.loader = "fetch";
    const worklogs = await this.issueWorklogService.getIssueWorklogs(workspaceSlug, projectId, issueId);

    runInAction(() => {
      set(
        this.worklogs,
        issueId,
        worklogs.map((worklog) => worklog.id)
      );
      worklogs.forEach((worklog) => set(this.worklogMap, worklog.id, worklog));
      this.loader = undefined;
    });

    return worklogs;
  };

  createWorklog = async (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssueWorklog>) => {
    const response = await this.issueWorklogService.createIssueWorklog(workspaceSlug, projectId, issueId, data);

    runInAction(() => {
      update(this.worklogs, issueId, (worklogIds) => {
        if (!worklogIds) return [response.id];
        return uniq(concat(worklogIds, [response.id]));
      });
      set(this.worklogMap, response.id, response);
    });

    return response;
  };

  updateWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<TIssueWorklog>
  ) => {
    const response = await this.issueWorklogService.patchIssueWorklog(
      workspaceSlug,
      projectId,
      issueId,
      worklogId,
      data
    );

    runInAction(() => {
      set(this.worklogMap, worklogId, response);
    });

    return response;
  };

  removeWorklog = async (workspaceSlug: string, projectId: string, issueId: string, worklogId: string) => {
    await this.issueWorklogService.deleteIssueWorklog(workspaceSlug, projectId, issueId, worklogId);

    runInAction(() => {
      pull(this.worklogs[issueId], worklogId);
      delete this.worklogMap[worklogId];
    });
  };
}
