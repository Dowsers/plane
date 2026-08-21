/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type {
  TPageComment,
  TPageCommentCreatePayload,
  TPageCommentReplyPayload,
  TPageCommentUpdatePayload,
} from "@plane/types";

export type TPageCommentListParams = {
  resolved?: boolean;
  orphaned?: boolean;
};

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - injected into `PageCommentsStore`
 * the same way `TBasePageServices` is injected into `BasePage`: each
 * method is a closure already bound to the owning `workspaceSlug`/
 * `projectId`/`pageId` (or the workspace-scoped equivalent), built by
 * `ProjectPage`/`WorkspacePage` from `PageCommentService`
 * (@/services/page/page-comment.service) - see those two classes' own
 * `comments` field for the exact wiring, mirroring how `listReactions`/
 * `createReaction`/`removeReaction` are already wired for feature 2.
 */
export type TPageCommentsServices = {
  list: (params?: TPageCommentListParams) => Promise<TPageComment[]>;
  create: (payload: TPageCommentCreatePayload) => Promise<TPageComment>;
  update: (commentId: string, payload: TPageCommentUpdatePayload) => Promise<TPageComment>;
  remove: (commentId: string) => Promise<void>;
  reply: (threadId: string, payload: TPageCommentReplyPayload) => Promise<TPageComment>;
  resolve: (threadId: string) => Promise<TPageComment>;
  reopen: (threadId: string) => Promise<TPageComment>;
  createReaction: (commentId: string, reaction: string) => Promise<TPageComment["reactions"][number]>;
  removeReaction: (commentId: string, reaction: string) => Promise<void>;
};

export type TPageCommentsStore = {
  // observables
  threads: TPageComment[];
  isLoading: boolean;
  showResolved: boolean;
  activeThreadId: string | null;
  // computed
  liveThreads: TPageComment[];
  orphanedThreads: TPageComment[];
  unresolvedCount: number;
  // actions
  fetchThreads: () => Promise<void>;
  createThread: (payload: TPageCommentCreatePayload) => Promise<TPageComment | undefined>;
  addReply: (threadId: string, payload: TPageCommentReplyPayload) => Promise<TPageComment | undefined>;
  updateComment: (commentId: string, payload: TPageCommentUpdatePayload) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  resolveThread: (threadId: string) => Promise<void>;
  reopenThread: (threadId: string) => Promise<void>;
  createReaction: (commentId: string, reaction: string) => Promise<void>;
  removeReaction: (commentId: string, reaction: string, userId: string) => Promise<void>;
  setShowResolved: (value: boolean) => void;
  setActiveThreadId: (threadId: string | null) => void;
};

/**
 * Category 10, features 1+3 (merged) - a dedicated per-page-instance
 * sub-store (`BasePage.comments`, constructed alongside `BasePage.editor`
 * in `base-page.ts`), NOT a flat observable array living directly on
 * `BasePage` the way feature 2's `PageReaction`s are (`BasePage.reactions`).
 *
 * Feature 2's own precedent doc comment explains why a flat array was
 * enough there: "only one Page is ever open/rendered at a time in this
 * fork, so there is no need for a store shaped to serve many concurrent
 * entities at once" - that reasoning still holds here (this store is
 * still scoped to exactly one page instance), but the SHAPE of what it
 * holds is genuinely more complex than a flat reaction list:
 * - two-level nesting (root threads + their replies, each independently
 *   carrying their own reactions) that needs targeted find/replace/splice
 *   operations, not just concat/reject on a single flat array;
 * - the resolved/orphaned toggle state the comment gutter reads every
 *   render (`showResolved`) and the cross-component "which thread is
 *   currently highlighted" state the doc-highlight <-> gutter-card sync
 *   needs (`activeThreadId`) - neither has an equivalent on `PageReaction`.
 *
 * Splitting this into its own class (rather than growing `BasePage` with a
 * dozen more fields/actions) keeps `BasePage` itself readable and keeps
 * this feature's local invariants (the root/reply tree-walk helpers below)
 * contained to one file, the same way `PageEditorInstance` already keeps
 * the editor ref/asset list out of `BasePage` proper.
 */
export class PageCommentsStore implements TPageCommentsStore {
  threads: TPageComment[] = [];
  isLoading: boolean = false;
  showResolved: boolean = false;
  activeThreadId: string | null = null;

  constructor(private services: TPageCommentsServices) {
    makeObservable(this, {
      threads: observable,
      isLoading: observable.ref,
      showResolved: observable.ref,
      activeThreadId: observable.ref,
      liveThreads: computed,
      orphanedThreads: computed,
      unresolvedCount: computed,
      fetchThreads: action,
      createThread: action,
      addReply: action,
      updateComment: action,
      deleteComment: action,
      resolveThread: action,
      reopenThread: action,
      createReaction: action,
      removeReaction: action,
      setShowResolved: action,
      setActiveThreadId: action,
    });
  }

  /** Root threads with a live (non-orphaned) anchor, filtered by
   * `showResolved` - the gutter's normally-positioned cards. */
  get liveThreads() {
    return this.threads.filter((thread) => !thread.is_orphaned && (this.showResolved || !thread.is_resolved));
  }

  /** Root threads whose anchor no longer appears in the document
   * (`is_orphaned`), filtered by `showResolved` - grouped together in a
   * fixed section at the top of the gutter (exigence 6), never positioned
   * against a live anchor. */
  get orphanedThreads() {
    return this.threads.filter((thread) => thread.is_orphaned && (this.showResolved || !thread.is_resolved));
  }

  get unresolvedCount() {
    return this.threads.filter((thread) => !thread.is_resolved).length;
  }

  /** Locates a comment (root or reply) by id and returns the observable
   * array it currently lives in plus its index, so callers can replace
   * (`container[index] = updated`) or remove (`container.splice(index, 1)`)
   * it in place. Returns `undefined` if the comment isn't loaded locally
   * (e.g. it was created by another collaborator and we haven't refetched
   * yet). */
  private locateComment(commentId: string): { container: TPageComment[]; index: number } | undefined {
    const rootIndex = this.threads.findIndex((thread) => thread.id === commentId);
    if (rootIndex !== -1) return { container: this.threads, index: rootIndex };

    for (const thread of this.threads) {
      const replyIndex = thread.replies.findIndex((reply) => reply.id === commentId);
      if (replyIndex !== -1) return { container: thread.replies, index: replyIndex };
    }
    return undefined;
  }

  fetchThreads = async () => {
    runInAction(() => {
      this.isLoading = true;
    });
    try {
      const threads = await this.services.list();
      runInAction(() => {
        this.threads = threads;
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  };

  createThread = async (payload: TPageCommentCreatePayload) => {
    const thread = await this.services.create(payload);
    runInAction(() => {
      this.threads = [...this.threads, thread];
    });
    return thread;
  };

  addReply = async (threadId: string, payload: TPageCommentReplyPayload) => {
    const reply = await this.services.reply(threadId, payload);
    runInAction(() => {
      const rootIndex = this.threads.findIndex((thread) => thread.id === threadId);
      if (rootIndex === -1) return;
      const root = this.threads[rootIndex];
      this.threads[rootIndex] = { ...root, replies: [...root.replies, reply] };
    });
    return reply;
  };

  updateComment = async (commentId: string, payload: TPageCommentUpdatePayload) => {
    const updated = await this.services.update(commentId, payload);
    runInAction(() => {
      const located = this.locateComment(commentId);
      if (!located) return;
      located.container[located.index] = updated;
    });
  };

  deleteComment = async (commentId: string) => {
    await this.services.remove(commentId);
    runInAction(() => {
      const located = this.locateComment(commentId);
      if (!located) return;
      // Deleting a root soft-deletes the whole thread server-side (cascades
      // to its replies/reactions) - splicing it out of `this.threads` here
      // takes its nested `replies` with it for free, no separate cleanup
      // needed.
      located.container.splice(located.index, 1);
    });
  };

  resolveThread = async (threadId: string) => {
    const updated = await this.services.resolve(threadId);
    runInAction(() => {
      const rootIndex = this.threads.findIndex((thread) => thread.id === threadId);
      if (rootIndex === -1) return;
      this.threads[rootIndex] = updated;
    });
  };

  reopenThread = async (threadId: string) => {
    const updated = await this.services.reopen(threadId);
    runInAction(() => {
      const rootIndex = this.threads.findIndex((thread) => thread.id === threadId);
      if (rootIndex === -1) return;
      this.threads[rootIndex] = updated;
    });
  };

  createReaction = async (commentId: string, reaction: string) => {
    const response = await this.services.createReaction(commentId, reaction);
    runInAction(() => {
      const located = this.locateComment(commentId);
      if (!located) return;
      const comment = located.container[located.index];
      located.container[located.index] = { ...comment, reactions: [...comment.reactions, response] };
    });
  };

  removeReaction = async (commentId: string, reaction: string, userId: string) => {
    const located = this.locateComment(commentId);
    const comment = located?.container[located.index];
    const currentReaction = comment?.reactions.find((r) => r.reaction === reaction && r.actor === userId);

    if (located && comment && currentReaction) {
      runInAction(() => {
        located.container[located.index] = {
          ...comment,
          reactions: comment.reactions.filter((r) => r.id !== currentReaction.id),
        };
      });
    }

    try {
      await this.services.removeReaction(commentId, reaction);
    } catch (error) {
      if (located && comment && currentReaction) {
        runInAction(() => {
          const latest = this.locateComment(commentId);
          if (!latest) return;
          const latestComment = latest.container[latest.index];
          latest.container[latest.index] = {
            ...latestComment,
            reactions: [...latestComment.reactions, currentReaction],
          };
        });
      }
      throw error;
    }
  };

  setShowResolved = (value: boolean) => {
    runInAction(() => {
      this.showResolved = value;
    });
  };

  setActiveThreadId = (threadId: string | null) => {
    runInAction(() => {
      this.activeThreadId = threadId;
    });
  };
}
