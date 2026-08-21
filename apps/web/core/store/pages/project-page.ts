/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";
// constants
import { EPageAccess, EUserPermissions } from "@plane/constants";
import type { TPage } from "@plane/types";
// plane web store
import type { RootStore } from "@/plane-web/store/root.store";
// services
import { PageCommentService, PageReactionService, ProjectPageService } from "@/services/page";
const projectPageService = new ProjectPageService();
const pageReactionService = new PageReactionService();
const pageCommentService = new PageCommentService();
// store
import { BasePage } from "./base-page";
import type { TPageInstance } from "./base-page";

export type TProjectPage = TPageInstance;

export class ProjectPage extends BasePage implements TProjectPage {
  constructor(store: RootStore, page: TPage) {
    // required fields for API calls
    const { workspaceSlug } = store.router;
    const projectId = page.project_ids?.[0];
    // initialize base instance
    super(store, page, {
      update: async (payload) => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        return await projectPageService.update(workspaceSlug, projectId, page.id, payload);
      },
      updateDescription: async (document) => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.updateDescription(workspaceSlug, projectId, page.id, document);
      },
      updateAccess: async (payload) => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.updateAccess(workspaceSlug, projectId, page.id, payload);
      },
      lock: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.lock(workspaceSlug, projectId, page.id);
      },
      unlock: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.unlock(workspaceSlug, projectId, page.id);
      },
      archive: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        return await projectPageService.archive(workspaceSlug, projectId, page.id);
      },
      restore: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.restore(workspaceSlug, projectId, page.id);
      },
      duplicate: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        return await projectPageService.duplicate(workspaceSlug, projectId, page.id);
      },
      listReactions: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        return await pageReactionService.listReactions(workspaceSlug, projectId, page.id);
      },
      createReaction: async (reaction) => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        return await pageReactionService.createReaction(workspaceSlug, projectId, page.id, { reaction });
      },
      removeReaction: async (reaction) => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await pageReactionService.removeReaction(workspaceSlug, projectId, page.id, reaction);
      },
      // Category 10, features 1+3 (merged, "Commentaires ancres sur les
      // Pages" + "Resolution de fils de commentaires")
      comments: {
        list: async (params) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.listComments(workspaceSlug, projectId, page.id, params);
        },
        create: async (payload) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.createComment(workspaceSlug, projectId, page.id, payload);
        },
        update: async (commentId, payload) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.updateComment(workspaceSlug, projectId, page.id, commentId, payload);
        },
        remove: async (commentId) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          await pageCommentService.deleteComment(workspaceSlug, projectId, page.id, commentId);
        },
        reply: async (threadId, payload) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.replyToComment(workspaceSlug, projectId, page.id, threadId, payload);
        },
        resolve: async (threadId) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.resolveComment(workspaceSlug, projectId, page.id, threadId);
        },
        reopen: async (threadId) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.reopenComment(workspaceSlug, projectId, page.id, threadId);
        },
        createReaction: async (commentId, reaction) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          return await pageCommentService.createCommentReaction(workspaceSlug, projectId, page.id, commentId, {
            reaction,
          });
        },
        removeReaction: async (commentId, reaction) => {
          if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
          await pageCommentService.removeCommentReaction(workspaceSlug, projectId, page.id, commentId, reaction);
        },
      },
    });
    makeObservable(this, {
      // computed
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

  private getHighestRoleAcrossProjects = computedFn((): EUserPermissions | undefined => {
    const { workspaceSlug } = this.rootStore.router;
    if (!workspaceSlug || !this.project_ids?.length) return;
    let highestRole: EUserPermissions | undefined = undefined;
    this.project_ids.map((projectId) => {
      const currentUserProjectRole = this.rootStore.user.permission.getProjectRoleByWorkspaceSlugAndProjectId(
        workspaceSlug?.toString() || "",
        projectId?.toString() || ""
      );
      if (currentUserProjectRole) {
        if (!highestRole) highestRole = currentUserProjectRole;
        else if (currentUserProjectRole > highestRole) highestRole = currentUserProjectRole;
      }
    });
    return highestRole;
  });

  /**
   * @description returns true if the current logged in user can access the page
   */
  get canCurrentUserAccessPage() {
    const isPagePublic = this.access === EPageAccess.PUBLIC;
    return isPagePublic || this.isCurrentUserOwner;
  }

  /**
   * @description returns true if the current logged in user can edit the page
   */
  get canCurrentUserEditPage() {
    const highestRole = this.getHighestRoleAcrossProjects();
    const isPagePublic = this.access === EPageAccess.PUBLIC;
    return (
      (isPagePublic && !!highestRole && highestRole >= EUserPermissions.MEMBER) ||
      (!isPagePublic && this.isCurrentUserOwner)
    );
  }

  /**
   * @description returns true if the current logged in user can create a duplicate the page
   */
  get canCurrentUserDuplicatePage() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return !!highestRole && highestRole >= EUserPermissions.MEMBER;
  }

  /**
   * @description returns true if the current logged in user can lock the page
   */
  get canCurrentUserLockPage() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return this.isCurrentUserOwner || highestRole === EUserPermissions.ADMIN;
  }

  /**
   * @description returns true if the current logged in user can change the access of the page
   */
  get canCurrentUserChangeAccess() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return this.isCurrentUserOwner || highestRole === EUserPermissions.ADMIN;
  }

  /**
   * @description returns true if the current logged in user can archive the page
   */
  get canCurrentUserArchivePage() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return this.isCurrentUserOwner || highestRole === EUserPermissions.ADMIN;
  }

  /**
   * @description returns true if the current logged in user can delete the page
   */
  get canCurrentUserDeletePage() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return this.isCurrentUserOwner || highestRole === EUserPermissions.ADMIN;
  }

  /**
   * @description returns true if the current logged in user can favorite the page
   */
  get canCurrentUserFavoritePage() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return !!highestRole && highestRole >= EUserPermissions.MEMBER;
  }

  /**
   * @description returns true if the current logged in user can move the page
   */
  get canCurrentUserMovePage() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return this.isCurrentUserOwner || highestRole === EUserPermissions.ADMIN;
  }

  /**
   * @description returns true if the page can be edited
   */
  get isContentEditable() {
    const highestRole = this.getHighestRoleAcrossProjects();
    const isOwner = this.isCurrentUserOwner;
    const isPublic = this.access === EPageAccess.PUBLIC;
    const isArchived = this.archived_at;
    const isLocked = this.is_locked;

    return (
      !isArchived && !isLocked && (isOwner || (isPublic && !!highestRole && highestRole >= EUserPermissions.MEMBER))
    );
  }

  /**
   * @description Category 10, features 1+3 (merged) - mirrors
   * `PageCommentPermission`'s write-role gate exactly: project role ADMIN
   * or MEMBER, unconditionally (no owner/public-access exception, unlike
   * `canCurrentUserEditPage` above) - gates creating a root thread, a
   * reply, and resolving/reopening one.
   */
  get canCurrentUserCommentOnPage() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return !!highestRole && highestRole >= EUserPermissions.MEMBER;
  }

  /**
   * @description Category 10, features 1+3 (merged) - mirrors
   * `can_user_moderate_page_comment_thread`'s "Page owner or Admin" half
   * (the thread-author half is checked directly against a comment's
   * `actor` where it's rendered, not here).
   */
  get canCurrentUserModeratePageComments() {
    const highestRole = this.getHighestRoleAcrossProjects();
    return this.isCurrentUserOwner || highestRole === EUserPermissions.ADMIN;
  }

  getRedirectionLink = computedFn(() => {
    const { workspaceSlug } = this.rootStore.router;
    return `/${workspaceSlug}/projects/${this.project_ids?.[0]}/pages/${this.id}`;
  });
}
