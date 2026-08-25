/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { pull, concat, update, uniq, set, pick } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
// Plane Imports
import { isNetworkFailure } from "@plane/sync-engine";
import type { TIssueComment, TIssueCommentMap, TIssueCommentIdMap, TIssueServiceType } from "@plane/types";
// lib
// Category 12, feature 4 - aliased (not plain `rootStore`) because this
// file's `IssueCommentStore` constructor already has its own parameter
// named `rootStore` (`IIssueDetail`, the issue-detail root, an
// unrelated, pre-existing thing from a completely different root) -
// importing the real MobX `rootStore` singleton under the same name
// would shadow it.
import { rootStore as globalRootStore } from "@/lib/store-context";
// services
import { IssueCommentService } from "@/services/issue";
// types
import type { IIssueDetail } from "./root.store";

export type TCommentLoader = "fetch" | "create" | "update" | "delete" | "mutate" | undefined;

export interface IIssueCommentStoreActions {
  fetchComments: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    loaderType?: TCommentLoader
  ) => Promise<TIssueComment[]>;
  createComment: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: Partial<TIssueComment>
  ) => Promise<any>;
  updateComment: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    commentId: string,
    data: Partial<TIssueComment>
  ) => Promise<any>;
  removeComment: (workspaceSlug: string, projectId: string, issueId: string, commentId: string) => Promise<any>;
  // Category 12, feature 4 - see `IssueCommentStore.mergeFromSync`'s own docstring.
  mergeFromSync: (comments: Partial<TIssueComment>[]) => void;
}

export interface IIssueCommentStore extends IIssueCommentStoreActions {
  // observables
  loader: TCommentLoader;
  comments: TIssueCommentIdMap;
  commentMap: TIssueCommentMap;
  // helper methods
  getCommentsByIssueId: (issueId: string) => string[] | undefined;
  getCommentById: (activityId: string) => TIssueComment | undefined;
}

export class IssueCommentStore implements IIssueCommentStore {
  // observables
  loader: TCommentLoader = "fetch";
  comments: TIssueCommentIdMap = {};
  commentMap: TIssueCommentMap = {};
  serviceType;
  // root store
  rootIssueDetail: IIssueDetail;
  // services
  issueCommentService;

  constructor(rootStore: IIssueDetail, serviceType: TIssueServiceType) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      comments: observable,
      commentMap: observable,
      // actions
      fetchComments: action,
      createComment: action,
      updateComment: action,
      removeComment: action,
      mergeFromSync: action,
    });
    // root store
    this.serviceType = serviceType;
    this.rootIssueDetail = rootStore;
    // services
    this.issueCommentService = new IssueCommentService(serviceType);
  }

  // helper methods
  getCommentsByIssueId = (issueId: string) => {
    if (!issueId) return undefined;
    return this.comments[issueId] ?? undefined;
  };

  getCommentById = (commentId: string) => {
    if (!commentId) return undefined;
    return this.commentMap[commentId] ?? undefined;
  };

  fetchComments = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    loaderType: TCommentLoader = "fetch"
  ) => {
    this.loader = loaderType;

    let props = {};
    const existingCommentIds = this.getCommentsByIssueId(issueId);
    if (existingCommentIds && existingCommentIds.length > 0) {
      const _comment = this.getCommentById(existingCommentIds[existingCommentIds.length - 1]);
      if (_comment) props = { created_at__gt: _comment.created_at };
    }

    const comments = await this.issueCommentService.getIssueComments(workspaceSlug, projectId, issueId, props);

    const commentIds = comments.map((comment) => comment.id);
    runInAction(() => {
      update(this.comments, issueId, (_commentIds) => {
        if (!_commentIds) return commentIds;
        return uniq(concat(_commentIds, commentIds));
      });
      comments.forEach((comment) => {
        this.rootIssueDetail.commentReaction.applyCommentReactions(comment.id, comment?.comment_reactions || []);
        set(this.commentMap, comment.id, comment);
      });
      this.loader = undefined;
    });

    return comments;
  };

  /**
   * Category 12, feature 4 (docs/feature-specs/12-keyboard-mobile-
   * desktop.md in plane-selfhost) - merges the offline sync engine's
   * periodic workspace delta-pull results into `commentMap`/`comments`,
   * keeping this store's in-memory state fresh for any issue whose
   * thread has already been fetched at least once (matching the
   * exigence 7 "already-loaded views stay readable offline" scope this
   * feature targets) WITHOUT requiring that issue's detail view to
   * currently be open. Fed exclusively by
   * `apps/web/core/store/sync-engine.store.ts`'s `handleWorkerMessage`
   * on a `"delta-applied"` message - never called from anywhere the
   * existing `fetchComments`/`createComment`/`updateComment` above are
   * called from.
   */
  mergeFromSync = (comments: Partial<TIssueComment>[]) => {
    runInAction(() => {
      comments.forEach((comment) => {
        if (!comment.id || !comment.issue) return;
        set(this.commentMap, comment.id, { ...this.commentMap[comment.id], ...comment } as TIssueComment);
        update(this.comments, comment.issue, (_commentIds) => {
          if (!_commentIds) return [comment.id as string];
          return uniq(concat(_commentIds, [comment.id as string]));
        });
      });
    });
  };

  createComment = async (workspaceSlug: string, projectId: string, issueId: string, data: Partial<TIssueComment>) => {
    let response: TIssueComment;
    try {
      response = await this.issueCommentService.createIssueComment(workspaceSlug, projectId, issueId, data);
    } catch (error) {
      // Category 12, feature 4 - same catch-and-fall-back convention as
      // `base-issues.store.ts`'s `createIssue`: a genuine network
      // failure creates the comment locally (client-generated id) and
      // durably queues it. If `issueId` is ITSELF still a not-yet-synced
      // client id (the parent issue was also created offline in this
      // same session), `dependsOnClientId` makes the worker hold this
      // comment back until that issue's real server id is known (see
      // `@plane/sync-engine`'s `id-map.ts`) - exigence 3's own "une
      // issue doit etre creee cote serveur avant qu'un commentaire lie
      // ne soit envoye".
      if (!isNetworkFailure(error) || !globalRootStore.syncEngine.isFeatureEnabled) throw error;
      const dependsOnClientId = globalRootStore.syncEngine.isPendingClientId("issue", issueId) ? issueId : undefined;
      const entry = globalRootStore.syncEngine.enqueueCreateComment({
        projectId,
        issueId,
        payload: data,
        dependsOnClientId,
      });
      if (!entry) throw error;
      const now = new Date().toISOString();
      response = {
        ...data,
        id: entry.entityId,
        project: projectId,
        issue: issueId,
        created_at: now,
        updated_at: now,
      } as TIssueComment;
    }

    runInAction(() => {
      update(this.comments, issueId, (_commentIds) => {
        if (!_commentIds) return [response.id];
        return uniq(concat(_commentIds, [response.id]));
      });
      set(this.commentMap, response.id, response);
    });

    return response;
  };

  updateComment = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    commentId: string,
    data: Partial<TIssueComment>
  ) => {
    const commentBeforeUpdate = this.getCommentById(commentId);
    try {
      runInAction(() => {
        Object.keys(data).forEach((key) => {
          set(this.commentMap, [commentId, key], data[key as keyof TIssueComment]);
        });
      });

      const response = await this.issueCommentService.patchIssueComment(
        workspaceSlug,
        projectId,
        issueId,
        commentId,
        data
      );

      runInAction(() => {
        set(this.commentMap, [commentId, "updated_at"], response.updated_at);
        set(this.commentMap, [commentId, "edited_at"], response.edited_at);
      });

      return response;
    } catch (error) {
      // Category 12, feature 4 - a genuine network failure keeps the
      // optimistic edit already applied above (unlike the generic
      // `throw` below, which this codebase's existing behavior leaves
      // in place even for a real validation error - see this method's
      // own pre-existing lack of a revert, unchanged here) and durably
      // queues it for the sync engine's worker instead of just retrying
      // never.
      if (isNetworkFailure(error) && globalRootStore.syncEngine.isFeatureEnabled) {
        // Same `dependsOnClientId` reasoning as `base-issues.store.ts`'s
        // `updateIssue`: `commentId` may itself still be a not-yet-synced
        // client id (this comment was created offline, earlier in the
        // same session) - without this, the worker would PATCH an id the
        // server has never heard of and permanently fail the entry.
        const dependsOnClientId = globalRootStore.syncEngine.isPendingClientId("issue_comment", commentId)
          ? commentId
          : undefined;
        globalRootStore.syncEngine.enqueueUpdateComment({
          projectId,
          issueId,
          commentId,
          payload: data,
          baseUpdatedAt: commentBeforeUpdate?.updated_at,
          baseFieldValues: commentBeforeUpdate ? pick(commentBeforeUpdate, Object.keys(data)) : undefined,
          dependsOnClientId,
        });
        return undefined;
      }
      this.rootIssueDetail.activity.fetchActivities(workspaceSlug, projectId, issueId);
      throw error;
    }
  };

  removeComment = async (workspaceSlug: string, projectId: string, issueId: string, commentId: string) => {
    const response = await this.issueCommentService.deleteIssueComment(workspaceSlug, projectId, issueId, commentId);

    runInAction(() => {
      pull(this.comments[issueId], commentId);
      delete this.commentMap[commentId];
    });

    return response;
  };
}
