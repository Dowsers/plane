/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy, unset, set } from "lodash-es";
import { makeObservable, observable, runInAction, action, computed } from "mobx";
import { computedFn } from "mobx-utils";
// types
import { EUserPermissions } from "@plane/constants";
import type { TPage, TPageConvertTarget } from "@plane/types";
// helpers
import { getPageName } from "@plane/utils";
// plane web store
import type { RootStore } from "@/plane-web/store/root.store";
// services
import { WorkspacePageService } from "@/services/page";
// store
import type { CoreRootStore } from "../root.store";
import type { TWorkspacePage } from "./workspace-page";
import { WorkspacePage } from "./workspace-page";

type TLoader = "init-loader" | "mutation-loader" | undefined;

type TError = { title: string; description: string };

export const ROLE_PERMISSIONS_TO_CREATE_WIKI_PAGE = [EUserPermissions.ADMIN, EUserPermissions.MEMBER];

export interface IWorkspacePageStore {
  // observables
  loader: TLoader;
  data: Record<string, TWorkspacePage>; // pageId => Page
  error: TError | undefined;
  searchQuery: string;
  // computed
  isAnyPageAvailable: boolean;
  canCurrentUserCreatePage: boolean;
  // helper actions
  getPageById: (pageId: string) => TWorkspacePage | undefined;
  getAllPageIds: () => string[];
  getActivePageIdsByCollection: (collectionId: string | null) => string[];
  getArchivedPageIds: () => string[];
  updateSearchQuery: (query: string) => void;
  // actions
  fetchPagesList: (workspaceSlug: string) => Promise<TPage[] | undefined>;
  fetchPageDetails: (
    workspaceSlug: string,
    pageId: string,
    options?: { trackVisit?: boolean }
  ) => Promise<TPage | undefined>;
  createPage: (pageData: Partial<TPage>) => Promise<TPage | undefined>;
  removePage: (params: { pageId: string; shouldSync?: boolean }) => Promise<void>;
  reorderPage: (
    workspaceSlug: string,
    pageId: string,
    afterId: string | null,
    collectionId: string | null
  ) => Promise<void>;
  convertToProject: (workspaceSlug: string, pageId: string, projectId: string) => Promise<TPage | undefined>;
}

/**
 * Category 10, feature 4 ("Wiki workspace en GA") - the workspace-scoped
 * sibling of `ProjectPageStore`. A deliberate sibling class rather than a
 * parameterized version of `ProjectPageStore`: that store is internally
 * project-scoped in several ways that don't translate (its `data` keying
 * strategy is fine to reuse, but `getCurrentProjectPageIds`/the
 * `this.store.router.projectId` reaction have no equivalent here), and the
 * backend's own `WorkspacePageViewSet` is likewise a distinct class from
 * `PageViewSet` rather than an optional-project_id parameterization of it.
 */
export class WorkspacePageStore implements IWorkspacePageStore {
  // observables
  loader: TLoader = "init-loader";
  data: Record<string, TWorkspacePage> = {};
  error: TError | undefined = undefined;
  searchQuery: string = "";
  // service
  service: WorkspacePageService;
  rootStore: CoreRootStore;

  constructor(private store: RootStore) {
    makeObservable(this, {
      loader: observable.ref,
      data: observable,
      error: observable,
      searchQuery: observable.ref,
      isAnyPageAvailable: computed,
      canCurrentUserCreatePage: computed,
      updateSearchQuery: action,
      fetchPagesList: action,
      fetchPageDetails: action,
      createPage: action,
      removePage: action,
      reorderPage: action,
      convertToProject: action,
    });
    this.rootStore = store;
    this.service = new WorkspacePageService();
  }

  get isAnyPageAvailable() {
    if (this.loader) return true;
    return Object.keys(this.data).length > 0;
  }

  get canCurrentUserCreatePage() {
    const { workspaceSlug } = this.store.router;
    if (!workspaceSlug) return false;
    const workspaceRole = this.store.user.permission.getWorkspaceRoleByWorkspaceSlug(workspaceSlug.toString());
    const role = typeof workspaceRole === "string" ? parseInt(workspaceRole, 10) : workspaceRole;
    return !!role && ROLE_PERMISSIONS_TO_CREATE_WIKI_PAGE.includes(role);
  }

  getPageById = computedFn((pageId: string) => this.data?.[pageId] || undefined);

  /** All non-deleted top-level Wiki page ids (regardless of collection/archived state) - the base set every other helper below filters down from. */
  getAllPageIds = computedFn(() => Object.values(this.data || {}).map((page) => page.id as string));

  /** Active (non-archived) top-level page ids filed under a given Collection, or the Wiki root when `collectionId` is `null`. */
  getActivePageIdsByCollection = computedFn((collectionId: string | null) =>
    orderBy(
      Object.values(this.data || {}).filter(
        (page) => !page.archived_at && (page.collection_id ?? null) === collectionId
      ),
      [(page) => page.sort_order ?? 0, (page) => getPageName(page.name)]
    ).map((page) => page.id as string)
  );

  getArchivedPageIds = computedFn(() =>
    orderBy(
      Object.values(this.data || {}).filter((page) => !!page.archived_at),
      [(page) => getPageName(page.name)]
    ).map((page) => page.id as string)
  );

  updateSearchQuery = (query: string) => {
    runInAction(() => {
      this.searchQuery = query;
    });
  };

  fetchPagesList = async (workspaceSlug: string) => {
    try {
      if (!workspaceSlug) return undefined;

      runInAction(() => {
        this.loader = Object.keys(this.data).length > 0 ? "mutation-loader" : "init-loader";
        this.error = undefined;
      });

      const pages = await this.service.fetchAll(workspaceSlug);
      runInAction(() => {
        for (const page of pages) {
          if (page?.id) {
            const existingPage = this.getPageById(page.id);
            if (existingPage) {
              const { name, ...otherFields } = page;
              existingPage.mutateProperties(otherFields, false);
            } else {
              set(this.data, [page.id], new WorkspacePage(this.store, page));
            }
          }
        }
        this.loader = undefined;
      });

      return pages;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the Wiki pages, Please try again later.",
        };
      });
      throw error;
    }
  };

  fetchPageDetails = async (workspaceSlug: string, pageId: string, options?: { trackVisit?: boolean }) => {
    const { trackVisit } = options || {};
    try {
      if (!workspaceSlug || !pageId) return undefined;

      const currentPage = this.getPageById(pageId);
      runInAction(() => {
        this.loader = currentPage ? "mutation-loader" : "init-loader";
        this.error = undefined;
      });

      const page = await this.service.fetchById(workspaceSlug, pageId, trackVisit ?? true);

      let pageInstance: TWorkspacePage | undefined;
      runInAction(() => {
        if (page?.id) {
          pageInstance = this.getPageById(page.id);
          if (pageInstance) {
            pageInstance.mutateProperties(page, false);
          } else {
            pageInstance = new WorkspacePage(this.store, page);
            set(this.data, [page.id], pageInstance);
          }
        }
        this.loader = undefined;
      });

      // Category 10, feature 2 reactions - fetched as a side effect of the
      // detail fetch, same pattern as `ProjectPageStore.fetchPageDetails`.
      pageInstance?.fetchReactions();

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the Wiki page, Please try again later.",
        };
      });
      throw error;
    }
  };

  createPage = async (pageData: Partial<TPage>) => {
    try {
      const { workspaceSlug } = this.store.router;
      if (!workspaceSlug) return undefined;

      runInAction(() => {
        this.loader = "mutation-loader";
        this.error = undefined;
      });

      const page = await this.service.create(workspaceSlug.toString(), pageData);
      runInAction(() => {
        if (page?.id) set(this.data, [page.id], new WorkspacePage(this.store, page));
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to create the Wiki page, Please try again later.",
        };
      });
      throw error;
    }
  };

  removePage = async ({ pageId }: { pageId: string; shouldSync?: boolean }) => {
    try {
      const { workspaceSlug } = this.store.router;
      if (!workspaceSlug || !pageId) return undefined;

      await this.service.remove(workspaceSlug.toString(), pageId);
      runInAction(() => {
        unset(this.data, [pageId]);
        if (this.rootStore.favorite.entityMap[pageId]) this.rootStore.favorite.removeFavoriteFromStore(pageId);
      });
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to delete the Wiki page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /** Exigence 9 - drag & drop within a level and across Collections/root. */
  reorderPage = async (workspaceSlug: string, pageId: string, afterId: string | null, collectionId: string | null) => {
    const page = await this.service.reorder(workspaceSlug, pageId, { after_id: afterId, collection_id: collectionId });
    runInAction(() => {
      const instance = this.getPageById(pageId);
      instance?.mutateProperties(page, false);
    });
  };

  /**
   * Exigence 5, project-direction: "Deplacer vers un projet". Evicts the
   * page from this store's local cache on success (it's no longer a Wiki
   * page); the destination project page store lazily re-fetches it on
   * navigation, same pattern `ProjectPageStore.movePage`/`removePage`
   * already use for cross-store eviction.
   */
  convertToProject = async (workspaceSlug: string, pageId: string, projectId: string) => {
    const target: TPageConvertTarget = "project";
    const page = await this.service.convert(workspaceSlug, pageId, { target, project_id: projectId });
    runInAction(() => {
      unset(this.data, [pageId]);
    });
    return page;
  };
}
