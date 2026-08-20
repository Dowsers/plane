/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy, unset, set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import { EUserPermissions } from "@plane/constants";
import type { TPageCollection } from "@plane/types";
// services
import { PageCollectionService } from "@/services/page";
// plane web store
import type { RootStore } from "@/plane-web/store/root.store";

type TLoader = "init-loader" | "mutation-loader" | undefined;

type TError = { title: string; description: string };

/** Exigence 3 - Collections can nest at most 3 levels deep (root = depth 1). */
export const WIKI_COLLECTION_MAX_DEPTH = 3;

export interface IPageCollectionStore {
  loader: TLoader;
  data: Record<string, TPageCollection>;
  error: TError | undefined;
  // computed helpers
  isAnyCollectionAvailable: boolean;
  canCurrentUserCreateRootCollection: boolean;
  getCollectionById: (collectionId: string) => TPageCollection | undefined;
  getChildCollectionIds: (parentId: string | null) => string[];
  getCollectionDepth: (collectionId: string | null) => number;
  getDescendantCollectionIds: (collectionId: string) => string[];
  // actions
  fetchCollections: (workspaceSlug: string) => Promise<TPageCollection[] | undefined>;
  createCollection: (workspaceSlug: string, data: Partial<TPageCollection>) => Promise<TPageCollection>;
  updateCollection: (
    workspaceSlug: string,
    collectionId: string,
    data: Partial<TPageCollection>
  ) => Promise<TPageCollection>;
  removeCollection: (workspaceSlug: string, collectionId: string, cascade: boolean) => Promise<void>;
  reorderCollection: (
    workspaceSlug: string,
    collectionId: string,
    afterId: string | null,
    parentId: string | null
  ) => Promise<void>;
}

/**
 * Category 10, feature 4 ("Wiki workspace en GA") - Collections (folders)
 * used to organize workspace-level Wiki pages, mirroring
 * `WorkspacePageCollectionViewSet` on the backend. A brand-new store (no
 * project-scoped equivalent exists to mirror), since Collections are a
 * purely workspace-level concept.
 */
export class PageCollectionStore implements IPageCollectionStore {
  loader: TLoader = "init-loader";
  data: Record<string, TPageCollection> = {};
  error: TError | undefined = undefined;
  service: PageCollectionService;

  constructor(private store: RootStore) {
    makeObservable(this, {
      loader: observable.ref,
      data: observable,
      error: observable,
      isAnyCollectionAvailable: computed,
      canCurrentUserCreateRootCollection: computed,
      fetchCollections: action,
      createCollection: action,
      updateCollection: action,
      removeCollection: action,
      reorderCollection: action,
    });
    this.service = new PageCollectionService();
  }

  get isAnyCollectionAvailable() {
    if (this.loader) return true;
    return Object.keys(this.data).length > 0;
  }

  /** Exigence 4 - root Collection creation is gated by `wiki_root_creation_role`; creation for the current user is otherwise checked server-side (this is only used to pre-emptively hide the affordance client-side). */
  get canCurrentUserCreateRootCollection() {
    const { workspaceSlug } = this.store.router;
    if (!workspaceSlug) return false;
    const workspace = this.store.workspaceRoot.currentWorkspace;
    const workspaceRole = this.store.user.permission.getWorkspaceRoleByWorkspaceSlug(workspaceSlug.toString());
    const role = typeof workspaceRole === "string" ? parseInt(workspaceRole, 10) : workspaceRole;
    if (!role) return false;
    if (workspace?.wiki_root_creation_role === "ADMIN") return role === EUserPermissions.ADMIN;
    return role >= EUserPermissions.MEMBER;
  }

  getCollectionById = computedFn((collectionId: string) => this.data?.[collectionId] || undefined);

  getChildCollectionIds = computedFn((parentId: string | null) =>
    orderBy(
      Object.values(this.data || {}).filter((collection) => (collection.parent ?? null) === parentId),
      ["sort_order", "name"]
    ).map((collection) => collection.id)
  );

  /** 1-indexed depth (root Collections are depth 1). `null` (the Wiki root) is depth 0. */
  getCollectionDepth = computedFn((collectionId: string | null): number => {
    let depth = 0;
    let current = collectionId ? this.getCollectionById(collectionId) : undefined;
    // a collection itself counts once its own id was passed in
    if (collectionId) depth = 1;
    while (current?.parent) {
      current = this.getCollectionById(current.parent);
      if (current) depth += 1;
    }
    return depth;
  });

  getDescendantCollectionIds = computedFn((collectionId: string): string[] => {
    const result: string[] = [];
    const queue = [collectionId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;
      const children = this.getChildCollectionIds(currentId);
      result.push(...children);
      queue.push(...children);
    }
    return result;
  });

  fetchCollections = async (workspaceSlug: string) => {
    try {
      if (!workspaceSlug) return undefined;
      runInAction(() => {
        this.loader = Object.keys(this.data).length > 0 ? "mutation-loader" : "init-loader";
        this.error = undefined;
      });

      const collections = await this.service.fetchAll(workspaceSlug);
      runInAction(() => {
        for (const collection of collections) {
          if (collection?.id) set(this.data, [collection.id], collection);
        }
        this.loader = undefined;
      });

      return collections;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = { title: "Failed", description: "Failed to fetch the Wiki folders, please try again later." };
      });
      throw error;
    }
  };

  createCollection = async (workspaceSlug: string, data: Partial<TPageCollection>) => {
    const collection = await this.service.create(workspaceSlug, data);
    runInAction(() => {
      set(this.data, [collection.id], collection);
    });
    return collection;
  };

  updateCollection = async (workspaceSlug: string, collectionId: string, data: Partial<TPageCollection>) => {
    const collection = await this.service.update(workspaceSlug, collectionId, data);
    runInAction(() => {
      set(this.data, [collectionId], collection);
    });
    return collection;
  };

  /** Exigence 7 - see `PageCollectionService.remove`'s own docstring re: `cascade`. */
  removeCollection = async (workspaceSlug: string, collectionId: string, cascade: boolean) => {
    const descendantIds = cascade ? this.getDescendantCollectionIds(collectionId) : [];
    const collection = this.getCollectionById(collectionId);
    await this.service.remove(workspaceSlug, collectionId, cascade);
    runInAction(() => {
      unset(this.data, [collectionId]);
      if (cascade) {
        descendantIds.forEach((id) => unset(this.data, [id]));
      } else {
        // Promote direct children to this Collection's own parent (mirrors the backend's own non-cascade behaviour).
        Object.values(this.data).forEach((child) => {
          if (child.parent === collectionId) set(this.data, [child.id, "parent"], collection?.parent ?? null);
        });
      }
    });
    // Evict any promoted/removed pages from the local Wiki page cache so
    // the tree re-renders correctly without a full re-fetch.
    const workspacePages = this.store.workspacePages;
    Object.values(workspacePages.data).forEach((page) => {
      if (page.collection_id === collectionId) {
        if (cascade) {
          unset(workspacePages.data, [page.id as string]);
        } else {
          set(workspacePages.data, [page.id as string, "collection_id"], collection?.parent ?? null);
        }
      }
    });
  };

  reorderCollection = async (
    workspaceSlug: string,
    collectionId: string,
    afterId: string | null,
    parentId: string | null
  ) => {
    const collection = await this.service.reorder(workspaceSlug, collectionId, {
      after_id: afterId,
      collection_id: parentId,
    });
    runInAction(() => {
      set(this.data, [collectionId], collection);
    });
  };
}
