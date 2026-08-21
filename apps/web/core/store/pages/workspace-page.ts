/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { computed, makeObservable } from "mobx";
// constants
import { EPageAccess, EUserPermissions } from "@plane/constants";
import type { TPage } from "@plane/types";
// plane web store
import type { RootStore } from "@/plane-web/store/root.store";
// services
import { PageCommentService, PageReactionService, WorkspacePageService } from "@/services/page";
const workspacePageService = new WorkspacePageService();
const pageReactionService = new PageReactionService();
const pageCommentService = new PageCommentService();
// store
import { BasePage } from "./base-page";
import type { TPageInstance } from "./base-page";

export type TWorkspacePage = TPageInstance;

/**
 * Category 10, feature 4 ("Wiki workspace en GA") - the workspace-scoped
 * sibling of `ProjectPage`. Permissions are derived from the user's
 * *workspace* role (`getWorkspaceRoleByWorkspaceSlug`) rather than the
 * "highest role across linked projects" a project Page uses, since a Wiki
 * page has no project of its own by definition (`is_global = true`).
 * There is no workspace-scoped `duplicate` endpoint (exigence set doesn't
 * ask for one) - `canCurrentUserDuplicatePage` is always `false` here, so
 * `services.duplicate` below is never actually invoked.
 */
export class WorkspacePage extends BasePage implements TWorkspacePage {
  constructor(store: RootStore, page: TPage) {
    const { workspaceSlug } = store.router;

    super(store, page, {
      update: async (payload) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await workspacePageService.update(workspaceSlug, page.id, payload);
      },
      updateDescription: async (document) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.updateDescription(workspaceSlug, page.id, document);
      },
      updateAccess: async (payload) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.updateAccess(workspaceSlug, page.id, payload);
      },
      lock: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.lock(workspaceSlug, page.id);
      },
      unlock: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.unlock(workspaceSlug, page.id);
      },
      archive: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await workspacePageService.archive(workspaceSlug, page.id);
      },
      restore: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.restore(workspaceSlug, page.id);
      },
      duplicate: async () => {
        throw new Error("Duplicating a Wiki page is not supported.");
      },
      listReactions: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await pageReactionService.listWorkspaceReactions(workspaceSlug, page.id);
      },
      createReaction: async (reaction) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await pageReactionService.createWorkspaceReaction(workspaceSlug, page.id, { reaction });
      },
      removeReaction: async (reaction) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await pageReactionService.removeWorkspaceReaction(workspaceSlug, page.id, reaction);
      },
      // Category 10, features 1+3 (merged, "Commentaires ancres sur les
      // Pages" + "Resolution de fils de commentaires")
      comments: {
        list: async (params) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.listWorkspaceComments(workspaceSlug, page.id, params);
        },
        create: async (payload) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.createWorkspaceComment(workspaceSlug, page.id, payload);
        },
        update: async (commentId, payload) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.updateWorkspaceComment(workspaceSlug, page.id, commentId, payload);
        },
        remove: async (commentId) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          await pageCommentService.deleteWorkspaceComment(workspaceSlug, page.id, commentId);
        },
        reply: async (threadId, payload) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.replyToWorkspaceComment(workspaceSlug, page.id, threadId, payload);
        },
        resolve: async (threadId) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.resolveWorkspaceComment(workspaceSlug, page.id, threadId);
        },
        reopen: async (threadId) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.reopenWorkspaceComment(workspaceSlug, page.id, threadId);
        },
        createReaction: async (commentId, reaction) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.createWorkspaceCommentReaction(workspaceSlug, page.id, commentId, {
            reaction,
          });
        },
        removeReaction: async (commentId, reaction) => {
          if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
          await pageCommentService.removeWorkspaceCommentReaction(workspaceSlug, page.id, commentId, reaction);
        },
      },
    });

    makeObservable(this, {
      canCurrentUserAccessPage: computed,
      canCurrentUserEditPage: computed,
      canCurrentUserDuplicatePage: computed,
      canCurrentUserLockPage: computed,
      canCurrentUserChangeAccess: computed,
      canCurrentUserArchivePage: computed,
      canCurrentUserDeletePage: computed,
      canCurrentUserFavoritePage: computed,
      canCurrentUserMovePage: computed,
      isContentEditable: computed,
      canCurrentUserCommentOnPage: computed,
      canCurrentUserModeratePageComments: computed,
    });
  }

  private getWorkspaceRole = (): EUserPermissions | undefined => {
    const { workspaceSlug } = this.rootStore.router;
    if (!workspaceSlug) return undefined;
    const role = this.rootStore.user.permission.getWorkspaceRoleByWorkspaceSlug(workspaceSlug.toString());
    if (role === undefined) return undefined;
    return typeof role === "string" ? (parseInt(role, 10) as EUserPermissions) : (role as EUserPermissions);
  };

  get canCurrentUserAccessPage() {
    const isPagePublic = this.access === EPageAccess.PUBLIC;
    return isPagePublic || this.isCurrentUserOwner;
  }

  get canCurrentUserEditPage() {
    const workspaceRole = this.getWorkspaceRole();
    const isPagePublic = this.access === EPageAccess.PUBLIC;
    return (
      (isPagePublic && !!workspaceRole && workspaceRole >= EUserPermissions.MEMBER) ||
      (!isPagePublic && this.isCurrentUserOwner)
    );
  }

  /** No workspace-scoped duplicate endpoint exists - see class docstring. */
  get canCurrentUserDuplicatePage() {
    return false;
  }

  get canCurrentUserLockPage() {
    const workspaceRole = this.getWorkspaceRole();
    return this.isCurrentUserOwner || workspaceRole === EUserPermissions.ADMIN;
  }

  get canCurrentUserChangeAccess() {
    const workspaceRole = this.getWorkspaceRole();
    return this.isCurrentUserOwner || workspaceRole === EUserPermissions.ADMIN;
  }

  get canCurrentUserArchivePage() {
    const workspaceRole = this.getWorkspaceRole();
    return this.isCurrentUserOwner || workspaceRole === EUserPermissions.ADMIN;
  }

  get canCurrentUserDeletePage() {
    const workspaceRole = this.getWorkspaceRole();
    return this.isCurrentUserOwner || workspaceRole === EUserPermissions.ADMIN;
  }

  get canCurrentUserFavoritePage() {
    const workspaceRole = this.getWorkspaceRole();
    return !!workspaceRole && workspaceRole >= EUserPermissions.MEMBER;
  }

  /** "Move" here means the EE cross-project move feature (always off in
   * CE, see `usePageFlag`) - not the Wiki<->project conversion action,
   * which is gated separately (see `usePageConvertOperations`). */
  get canCurrentUserMovePage() {
    const workspaceRole = this.getWorkspaceRole();
    return this.isCurrentUserOwner || workspaceRole === EUserPermissions.ADMIN;
  }

  get isContentEditable() {
    const workspaceRole = this.getWorkspaceRole();
    const isOwner = this.isCurrentUserOwner;
    const isPublic = this.access === EPageAccess.PUBLIC;
    const isArchived = this.archived_at;
    const isLocked = this.is_locked;

    return (
      !isArchived && !isLocked && (isOwner || (isPublic && !!workspaceRole && workspaceRole >= EUserPermissions.MEMBER))
    );
  }

  /** Category 10, features 1+3 (merged) - see `ProjectPage`'s identically-
   * named getter; checked against the workspace role here (a Wiki page
   * has no project of its own), mirroring `WorkspacePageCommentPermission`. */
  get canCurrentUserCommentOnPage() {
    const workspaceRole = this.getWorkspaceRole();
    return !!workspaceRole && workspaceRole >= EUserPermissions.MEMBER;
  }

  /** Category 10, features 1+3 (merged) - see `ProjectPage`'s identically-
   * named getter. */
  get canCurrentUserModeratePageComments() {
    const workspaceRole = this.getWorkspaceRole();
    return this.isCurrentUserOwner || workspaceRole === EUserPermissions.ADMIN;
  }

  getRedirectionLink = () => {
    const { workspaceSlug } = this.rootStore.router;
    return `/${workspaceSlug}/wiki/${this.id}`;
  };
}
