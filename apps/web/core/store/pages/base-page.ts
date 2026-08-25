/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { concat, find, pick, reject, set } from "lodash-es";
import { action, computed, makeObservable, observable, reaction, runInAction } from "mobx";
// plane imports
import { EPageAccess } from "@plane/constants";
import type { TChangeHandlerProps } from "@plane/propel/emoji-icon-picker";
import { isNetworkFailure } from "@plane/sync-engine";
import type {
  TDocumentPayload,
  TLogoProps,
  TNameDescriptionLoader,
  TPage,
  TPageReaction,
  TPageSubscriber,
  TPageSubscriptionStatus,
} from "@plane/types";
// lib
import { rootStore } from "@/lib/store-context";
// plane web store
import { ExtendedBasePage } from "@/plane-web/store/pages/extended-base-page";
import type { RootStore } from "@/plane-web/store/root.store";
// local imports
import { PageEditorInstance } from "./page-editor-info";
import { PageCommentsStore } from "./page-comments";
import type { TPageCommentsServices } from "./page-comments";

export type TBasePage = TPage & {
  // observables
  isSubmitting: TNameDescriptionLoader;
  isSyncingWithServer: "syncing" | "synced" | "error";
  // computed
  asJSON: TPage | undefined;
  isCurrentUserOwner: boolean;
  // helpers
  oldName: string;
  setIsSubmitting: (value: TNameDescriptionLoader) => void;
  cleanup: () => void;
  // actions
  update: (pageData: Partial<TPage>) => Promise<Partial<TPage> | undefined>;
  updateTitle: (title: string) => void;
  updateDescription: (document: TDocumentPayload) => Promise<void>;
  makePublic: (params: { shouldSync?: boolean }) => Promise<void>;
  makePrivate: (params: { shouldSync?: boolean }) => Promise<void>;
  lock: (params: { shouldSync?: boolean; recursive?: boolean }) => Promise<void>;
  unlock: (params: { shouldSync?: boolean; recursive?: boolean }) => Promise<void>;
  archive: (params: { shouldSync?: boolean; archived_at?: string | null }) => Promise<void>;
  restore: (params: { shouldSync?: boolean }) => Promise<void>;
  updatePageLogo: (value: TChangeHandlerProps) => Promise<void>;
  addToFavorites: () => Promise<void>;
  removePageFromFavorites: () => Promise<void>;
  duplicate: () => Promise<TPage | undefined>;
  mutateProperties: (data: Partial<TPage>, shouldUpdateName?: boolean) => void;
  setSyncingStatus: (status: "syncing" | "synced" | "error") => void;
  // reactions (category 10, feature 2 - "Reactions emoji sur les Pages")
  reactions: TPageReaction[];
  fetchReactions: () => Promise<TPageReaction[] | undefined>;
  createReaction: (reaction: string) => Promise<TPageReaction | undefined>;
  removeReaction: (reaction: string, userId: string) => Promise<void>;
  // Category 10, feature 5 ("Abonnements/notifications par page") - like
  // `reactions` above, not embedded in the Page's own GET response, so
  // fetched separately and kept as simple observable state directly on the
  // page instance (see this feature's own build report for why - same
  // "only one Page open at a time" reasoning `reactions` already gives).
  isSubscribed: boolean;
  subscribers: TPageSubscriber[];
  fetchSubscription: () => Promise<boolean | undefined>;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  fetchSubscribers: () => Promise<TPageSubscriber[] | undefined>;
  // sub-store
  editor: PageEditorInstance;
  // Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages"
  // + "Resolution de fils de commentaires") - see `PageCommentsStore`'s own
  // docstring for why this is a dedicated sub-store rather than a flat
  // array like `reactions` above.
  comments: PageCommentsStore;
};

export type TBasePagePermissions = {
  canCurrentUserAccessPage: boolean;
  canCurrentUserEditPage: boolean;
  canCurrentUserDuplicatePage: boolean;
  canCurrentUserLockPage: boolean;
  canCurrentUserChangeAccess: boolean;
  canCurrentUserArchivePage: boolean;
  canCurrentUserDeletePage: boolean;
  canCurrentUserFavoritePage: boolean;
  canCurrentUserMovePage: boolean;
  isContentEditable: boolean;
  // Category 10, features 1+3 (merged) - mirrors `PageCommentPermission`/
  // `WorkspacePageCommentPermission`'s write-role gate (project/workspace
  // role ADMIN or MEMBER, unconditionally - no owner or public-access
  // exception, unlike `isContentEditable`) for creating a root thread, a
  // reply, or resolving/reopening one. UI-only - the server enforces this
  // independently, see this feature's build report.
  canCurrentUserCommentOnPage: boolean;
  // Category 10, features 1+3 (merged) - mirrors
  // `can_user_moderate_page_comment_thread`'s "Page owner or Admin" half
  // (the "thread author" half is comment-specific, checked directly
  // against `actor` where a thread/reply is rendered). Combined with
  // `canCurrentUserCommentOnPage` (still required - see above) this gates
  // resolve/reopen/delete for non-authors.
  canCurrentUserModeratePageComments: boolean;
};

export type TBasePageServices = {
  update: (payload: Partial<TPage>) => Promise<Partial<TPage>>;
  updateDescription: (document: TDocumentPayload) => Promise<void>;
  updateAccess: (payload: Pick<TPage, "access">) => Promise<void>;
  lock: () => Promise<void>;
  unlock: () => Promise<void>;
  archive: () => Promise<{
    archived_at: string;
  }>;
  restore: () => Promise<void>;
  duplicate: () => Promise<TPage>;
  listReactions: () => Promise<TPageReaction[]>;
  createReaction: (reaction: string) => Promise<TPageReaction>;
  removeReaction: (reaction: string) => Promise<void>;
  // Category 10, features 1+3 (merged) - see `PageCommentsStore`
  // (./page-comments) for how this bag is consumed.
  comments: TPageCommentsServices;
  // Category 10, feature 5 ("Abonnements/notifications par page")
  subscription: TBasePageSubscriptionServices;
};

/** Category 10, feature 5 - bound (workspaceSlug/projectId/pageId already
 * closed over) subscription operations, mirroring `listReactions`/
 * `createReaction`/`removeReaction`'s own shape above. See `ProjectPage`/
 * `WorkspacePage` for the two concrete wirings. */
export type TBasePageSubscriptionServices = {
  getStatus: () => Promise<TPageSubscriptionStatus>;
  subscribe: () => Promise<TPageSubscriptionStatus>;
  unsubscribe: () => Promise<void>;
  listSubscribers: () => Promise<TPageSubscriber[]>;
};

export type TPageInstance = TBasePage &
  TBasePagePermissions & {
    getRedirectionLink: () => string;
  };

export class BasePage extends ExtendedBasePage implements TBasePage {
  // loaders
  isSubmitting: TNameDescriptionLoader = "saved";
  isSyncingWithServer: "syncing" | "synced" | "error" = "syncing";
  // page properties
  id: string | undefined;
  name: string | undefined;
  logo_props: TLogoProps | undefined;
  description_json: object | undefined;
  description_html: string | undefined;
  color: string | undefined;
  label_ids: string[] | undefined;
  owned_by: string | undefined;
  access: EPageAccess | undefined;
  is_favorite: boolean;
  is_locked: boolean;
  archived_at: string | null | undefined;
  workspace: string | undefined;
  project_ids?: string[] | undefined;
  created_by: string | undefined;
  updated_by: string | undefined;
  created_at: Date | undefined;
  updated_at: Date | undefined;
  deleted_at: Date | undefined;
  // Category 10, feature 4 ("Wiki workspace en GA") - present on every
  // Page payload regardless of scope (read-only server-side, see `TPage`'s
  // own comment); `collection_id`/`sort_order` are only ever meaningful
  // when `is_global` is true.
  is_global: boolean;
  collection_id: string | null | undefined;
  sort_order: number | undefined;
  // Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages"
  // + "Resolution de fils de commentaires") - read-only, annotated
  // server-side on every Page list/detail response (see `TPage`'s own
  // comment). NOT used to drive the comment gutter/thread list itself -
  // `PageCommentsStore.unresolvedCount` (computed from the threads it has
  // actually fetched) is the source of truth there and can't drift from
  // it; this is only kept for parity with the API response shape (e.g. a
  // future Page-list badge, out of this feature's own scope).
  unresolved_comment_count: number;
  // reactions (category 10, feature 2) - fetched separately from the
  // page's own GET (no `reactions` field on `TPage`/the Page serializer),
  // mirrors `label_ids`/`is_favorite` in spirit (simple observable state
  // living directly on the page instance) rather than a separate global
  // reaction-map store keyed by page id: unlike issues, only one Page is
  // ever open/rendered at a time in this fork, so there is no need for a
  // store shaped to serve many concurrent entities at once.
  reactions: TPageReaction[] = [];
  // Category 10, feature 5 ("Abonnements/notifications par page") - see
  // `TBasePage`'s own comment on these two fields for why they're fetched
  // separately rather than embedded on `TPage`.
  isSubscribed: boolean = false;
  subscribers: TPageSubscriber[] = [];
  // helpers
  oldName: string = "";
  // services
  services: TBasePageServices;
  // reactions
  disposers: Array<() => void> = [];
  // root store
  rootStore: RootStore;
  // sub-store
  editor: PageEditorInstance;
  // Category 10, features 1+3 (merged) - see `PageCommentsStore`'s own
  // docstring; constructed below alongside `editor`.
  comments: PageCommentsStore;

  constructor(
    private store: RootStore,
    page: TPage,
    services: TBasePageServices
  ) {
    super(store, page, services);

    this.id = page?.id || undefined;
    this.name = page?.name;
    this.logo_props = page?.logo_props || undefined;
    this.description_json = page?.description_json || undefined;
    this.description_html = page?.description_html || undefined;
    this.color = page?.color || undefined;
    this.label_ids = page?.label_ids || undefined;
    this.owned_by = page?.owned_by || undefined;
    this.access = page?.access || EPageAccess.PUBLIC;
    this.is_favorite = page?.is_favorite || false;
    this.is_locked = page?.is_locked || false;
    this.archived_at = page?.archived_at || undefined;
    this.workspace = page?.workspace || undefined;
    this.project_ids = page?.project_ids || undefined;
    this.created_by = page?.created_by || undefined;
    this.updated_by = page?.updated_by || undefined;
    this.created_at = page?.created_at || undefined;
    this.updated_at = page?.updated_at || undefined;
    this.oldName = page?.name || "";
    this.deleted_at = page?.deleted_at || undefined;
    this.is_global = page?.is_global || false;
    this.collection_id = page?.collection_id || undefined;
    this.sort_order = page?.sort_order ?? undefined;
    this.unresolved_comment_count = page?.unresolved_comment_count ?? 0;
    this.reactions = [];
    this.isSubscribed = false;
    this.subscribers = [];

    makeObservable(this, {
      // loaders
      isSubmitting: observable.ref,
      // page properties
      id: observable.ref,
      name: observable.ref,
      logo_props: observable.ref,
      description_json: observable.ref,
      description_html: observable.ref,
      color: observable.ref,
      label_ids: observable,
      owned_by: observable.ref,
      access: observable.ref,
      is_favorite: observable.ref,
      is_locked: observable.ref,
      archived_at: observable.ref,
      workspace: observable.ref,
      project_ids: observable,
      created_by: observable.ref,
      updated_by: observable.ref,
      created_at: observable.ref,
      updated_at: observable.ref,
      deleted_at: observable.ref,
      isSyncingWithServer: observable.ref,
      // Category 10, feature 4 ("Wiki workspace en GA")
      is_global: observable.ref,
      collection_id: observable.ref,
      sort_order: observable.ref,
      // Category 10, features 1+3 (merged)
      unresolved_comment_count: observable.ref,
      // reactions
      reactions: observable,
      // Category 10, feature 5 ("Abonnements/notifications par page")
      isSubscribed: observable.ref,
      subscribers: observable,
      // helpers
      oldName: observable.ref,
      setIsSubmitting: action,
      cleanup: action,
      // computed
      asJSON: computed,
      isCurrentUserOwner: computed,
      // actions
      update: action,
      updateTitle: action,
      updateDescription: action,
      makePublic: action,
      makePrivate: action,
      lock: action,
      unlock: action,
      archive: action,
      restore: action,
      updatePageLogo: action,
      addToFavorites: action,
      removePageFromFavorites: action,
      duplicate: action,
      mutateProperties: action,
      fetchReactions: action,
      createReaction: action,
      removeReaction: action,
      // Category 10, feature 5 ("Abonnements/notifications par page")
      fetchSubscription: action,
      subscribe: action,
      unsubscribe: action,
      fetchSubscribers: action,
    });

    // init
    this.services = services;
    this.rootStore = store;
    this.editor = new PageEditorInstance();
    this.comments = new PageCommentsStore(services.comments);

    const titleDisposer = reaction(
      () => this.name,
      (name) => {
        this.isSubmitting = "submitting";
        this.services
          .update({
            name,
          })
          .catch(() =>
            runInAction(() => {
              this.name = this.oldName;
            })
          )
          .finally(() =>
            runInAction(() => {
              this.isSubmitting = "submitted";
            })
          );
      },
      { delay: 2000 }
    );
    this.disposers.push(titleDisposer);
  }

  // computed
  get asJSON() {
    return {
      id: this.id,
      name: this.name,
      description_json: this.description_json,
      description_html: this.description_html,
      color: this.color,
      label_ids: this.label_ids,
      owned_by: this.owned_by,
      access: this.access,
      logo_props: this.logo_props,
      is_favorite: this.is_favorite,
      is_locked: this.is_locked,
      archived_at: this.archived_at,
      workspace: this.workspace,
      project_ids: this.project_ids,
      created_by: this.created_by,
      updated_by: this.updated_by,
      created_at: this.created_at,
      updated_at: this.updated_at,
      deleted_at: this.deleted_at,
      is_global: this.is_global,
      collection_id: this.collection_id,
      sort_order: this.sort_order,
      unresolved_comment_count: this.unresolved_comment_count,
      ...this.asJSONExtended,
    };
  }

  get isCurrentUserOwner() {
    const currentUserId = this.store.user.data?.id;
    if (!currentUserId) return false;
    return this.owned_by === currentUserId;
  }

  /**
   * @description update the submitting state
   * @param value
   */
  setIsSubmitting = (value: TNameDescriptionLoader) => {
    runInAction(() => {
      this.isSubmitting = value;
    });
  };

  cleanup = () => {
    this.disposers.forEach((disposer) => {
      disposer();
    });
  };

  /**
   * @description update the page
   * @param {Partial<TPage>} pageData
   */
  update = async (pageData: Partial<TPage>) => {
    const currentPage = this.asJSON;
    try {
      runInAction(() => {
        Object.keys(pageData).forEach((key) => {
          const currentPageKey = key as keyof TPage;
          set(this, key, pageData[currentPageKey] || undefined);
        });
      });

      return await this.services.update(currentPage);
    } catch (error) {
      // Category 12, feature 4 (docs/feature-specs/12-keyboard-mobile-
      // desktop.md in plane-selfhost) - METADATA fields only (name,
      // access, ...), never the rich-text body: `updateDescription`
      // below is untouched by this feature and keeps deferring entirely
      // to the existing Yjs/Hocuspocus CRDT sync, see this feature's own
      // `README.md` "Page body vs. LWW" section for why routing Page
      // saves through this generic last-write-wins path would be a real
      // bug, not a shortcut. A genuine network failure keeps the
      // optimistic metadata edit already applied above and durably
      // queues it, instead of reverting.
      if (isNetworkFailure(error) && this.id && rootStore.syncEngine.isFeatureEnabled) {
        rootStore.syncEngine.enqueueUpdatePageMetadata({
          pageId: this.id,
          projectId: this.project_ids?.[0],
          payload: pageData,
          baseUpdatedAt: currentPage?.updated_at ? new Date(currentPage.updated_at).toISOString() : undefined,
          baseFieldValues: currentPage ? pick(currentPage, Object.keys(pageData)) : undefined,
        });
        return currentPage;
      }
      runInAction(() => {
        Object.keys(pageData).forEach((key) => {
          const currentPageKey = key as keyof TPage;
          set(this, key, currentPage?.[currentPageKey] || undefined);
        });
      });
      throw error;
    }
  };

  /**
   * @description update the page title
   * @param title
   */
  updateTitle = (title: string) => {
    this.oldName = this.name ?? "";
    this.name = title;
  };

  /**
   * @description update the page description
   * @param {TDocumentPayload} document
   */
  updateDescription = async (document: TDocumentPayload) => {
    const currentDescription = this.description_html;
    runInAction(() => {
      this.description_html = document.description_html;
    });

    try {
      await this.services.updateDescription(document);
    } catch (error) {
      runInAction(() => {
        this.description_html = currentDescription;
      });
      throw error;
    }
  };

  /**
   * @description make the page public
   */
  makePublic = async ({ shouldSync = true }) => {
    const pageAccess = this.access;
    runInAction(() => {
      this.access = EPageAccess.PUBLIC;
    });

    if (shouldSync) {
      try {
        await this.services.updateAccess({
          access: EPageAccess.PUBLIC,
        });
      } catch (error) {
        runInAction(() => {
          this.access = pageAccess;
        });
        throw error;
      }
    }
  };

  /**
   * @description make the page private
   */
  makePrivate = async ({ shouldSync = true }) => {
    const pageAccess = this.access;
    runInAction(() => {
      this.access = EPageAccess.PRIVATE;
    });

    if (shouldSync) {
      try {
        await this.services.updateAccess({
          access: EPageAccess.PRIVATE,
        });
      } catch (error) {
        runInAction(() => {
          this.access = pageAccess;
        });
        throw error;
      }
    }
  };

  /**
   * @description lock the page
   */
  lock = async ({ shouldSync = true }) => {
    const pageIsLocked = this.is_locked;
    runInAction(() => (this.is_locked = true));

    if (shouldSync) {
      await this.services.lock().catch((error) => {
        runInAction(() => {
          this.is_locked = pageIsLocked;
        });
        throw error;
      });
    }
  };

  /**
   * @description unlock the page
   */
  unlock = async ({ shouldSync = true }) => {
    const pageIsLocked = this.is_locked;
    runInAction(() => (this.is_locked = false));

    if (shouldSync) {
      await this.services.unlock().catch((error) => {
        runInAction(() => {
          this.is_locked = pageIsLocked;
        });
        throw error;
      });
    }
  };

  /**
   * @description archive the page
   */
  archive = async ({ shouldSync = true, archived_at }: { shouldSync?: boolean; archived_at?: string | null }) => {
    if (!this.id) return undefined;

    try {
      runInAction(() => {
        this.archived_at = archived_at ?? new Date().toISOString();
      });

      if (this.rootStore.favorite.entityMap[this.id]) this.rootStore.favorite.removeFavoriteFromStore(this.id);

      if (shouldSync) {
        const response = await this.services.archive();
        runInAction(() => {
          this.archived_at = response.archived_at;
        });
      }
    } catch (error) {
      console.error(error);
      runInAction(() => {
        this.archived_at = null;
      });
    }
  };

  /**
   * @description restore the page
   */
  restore = async ({ shouldSync = true }: { shouldSync?: boolean }) => {
    const archivedAtBeforeRestore = this.archived_at;

    try {
      runInAction(() => {
        this.archived_at = null;
      });

      if (shouldSync) {
        await this.services.restore();
      }
    } catch (error) {
      console.error(error);
      runInAction(() => {
        this.archived_at = archivedAtBeforeRestore;
      });
      throw error;
    }
  };

  updatePageLogo = async (value: TChangeHandlerProps) => {
    const originalLogoProps = { ...this.logo_props };
    try {
      let logoValue = {};
      if (value?.type === "emoji")
        logoValue = {
          value: value.value,
          url: undefined,
        };
      else if (value?.type === "icon") logoValue = value.value;

      const logoProps: TLogoProps = {
        in_use: value?.type,
        [value?.type]: logoValue,
      };

      runInAction(() => {
        this.logo_props = logoProps;
      });
      await this.services.update({
        logo_props: logoProps,
      });
    } catch (error) {
      console.error("Error in updating page logo", error);
      runInAction(() => {
        this.logo_props = originalLogoProps as TLogoProps;
      });
      throw error;
    }
  };

  /**
   * @description add the page to favorites
   */
  addToFavorites = async () => {
    const { workspaceSlug } = this.store.router;
    const projectId = this.project_ids?.[0] ?? null;
    if (!workspaceSlug || !this.id) return undefined;

    const pageIsFavorite = this.is_favorite;
    runInAction(() => {
      this.is_favorite = true;
    });
    await this.rootStore.favorite
      .addFavorite(workspaceSlug.toString(), {
        entity_type: "page",
        entity_identifier: this.id,
        project_id: projectId,
        entity_data: { name: this.name || "" },
      })
      .catch((error) => {
        runInAction(() => {
          this.is_favorite = pageIsFavorite;
        });
        throw error;
      });
  };

  /**
   * @description remove the page from favorites
   */
  removePageFromFavorites = async () => {
    const { workspaceSlug } = this.store.router;
    if (!workspaceSlug || !this.id) return undefined;

    const pageIsFavorite = this.is_favorite;
    runInAction(() => {
      this.is_favorite = false;
    });

    await this.rootStore.favorite.removeFavoriteEntity(workspaceSlug, this.id).catch((error) => {
      runInAction(() => {
        this.is_favorite = pageIsFavorite;
      });
      throw error;
    });
  };

  /**
   * @description duplicate the page
   */
  duplicate = async () => await this.services.duplicate();

  /**
   * @description mutate multiple properties at once
   * @param data Partial<TPage>
   */
  mutateProperties = (data: Partial<TPage>, shouldUpdateName: boolean = true) => {
    Object.keys(data).forEach((key) => {
      const value = data[key as keyof TPage];
      if (key === "name" && !shouldUpdateName) return;
      set(this, key, value);
    });
  };

  setSyncingStatus = (status: "syncing" | "synced" | "error") => {
    runInAction(() => {
      this.isSyncingWithServer = status;
    });
  };

  /**
   * @description fetch the page's reactions (category 10, feature 2).
   * Fire-and-forget friendly: swallows and logs its own errors rather than
   * throwing, since it is invoked as a side effect of the page detail
   * fetch (see `ProjectPageStore.fetchPageDetails`) and should never block
   * or fail that fetch.
   */
  fetchReactions = async () => {
    if (!this.id) return undefined;
    try {
      const reactions = await this.services.listReactions();
      runInAction(() => {
        this.reactions = reactions;
      });
      return reactions;
    } catch (error) {
      console.error("Error in fetching page reactions", error);
      return undefined;
    }
  };

  /**
   * @description add a reaction to the page. The server rejects a duplicate
   * (same actor + same emoji) POST with a 400 rather than toggling it -
   * toggle behaviour is handled by the caller (see `PageReactions`), which
   * should call `removeReaction` instead when the current user already has
   * that reaction.
   */
  createReaction = async (reactionEmoji: string) => {
    const response = await this.services.createReaction(reactionEmoji);
    runInAction(() => {
      this.reactions = concat(this.reactions, response);
    });
    return response;
  };

  /**
   * @description remove one of the current user's own reactions from the
   * page. Optimistically removes it from local state first (rolled back on
   * failure) - the DELETE endpoint itself is always scoped to
   * `actor=request.user` server-side, so `userId` is only used here to look
   * up the local reaction to remove, not sent to the server.
   */
  removeReaction = async (reactionEmoji: string, userId: string) => {
    const currentReaction = find(this.reactions, { reaction: reactionEmoji, actor: userId });

    if (currentReaction) {
      runInAction(() => {
        this.reactions = reject(this.reactions, { id: currentReaction.id });
      });
    }

    try {
      await this.services.removeReaction(reactionEmoji);
    } catch (error) {
      if (currentReaction) {
        runInAction(() => {
          this.reactions = concat(this.reactions, currentReaction);
        });
      }
      throw error;
    }
  };

  /**
   * @description Category 10, feature 5 ("Abonnements/notifications par
   * page") - fetch the current user's subscription state for this page.
   * Fire-and-forget friendly, same reasoning as `fetchReactions` above
   * (invoked as a side effect of the page detail fetch, see
   * `ProjectPageStore`/`WorkspacePageStore.fetchPageDetails`).
   */
  fetchSubscription = async () => {
    if (!this.id) return undefined;
    try {
      const { subscribed } = await this.services.subscription.getStatus();
      runInAction(() => {
        this.isSubscribed = subscribed;
      });
      return subscribed;
    } catch (error) {
      console.error("Error in fetching page subscription status", error);
      return undefined;
    }
  };

  /**
   * @description subscribe the current user to this page's notifications
   * (exigence 1/2/4 - re-subscribing after an explicit unsubscribe is
   * always allowed server-side). Optimistic, rolled back on failure.
   */
  subscribe = async () => {
    const wasSubscribed = this.isSubscribed;
    runInAction(() => {
      this.isSubscribed = true;
    });
    try {
      await this.services.subscription.subscribe();
    } catch (error) {
      runInAction(() => {
        this.isSubscribed = wasSubscribed;
      });
      throw error;
    }
  };

  /**
   * @description unsubscribe the current user from this page's
   * notifications (exigence 4). Allowed unconditionally server-side, even
   * without current read access to the page (exigence 9).
   */
  unsubscribe = async () => {
    const wasSubscribed = this.isSubscribed;
    runInAction(() => {
      this.isSubscribed = false;
    });
    try {
      await this.services.subscription.unsubscribe();
    } catch (error) {
      runInAction(() => {
        this.isSubscribed = wasSubscribed;
      });
      throw error;
    }
  };

  /**
   * @description Category 10, feature 5 - fetch the page's subscriber
   * list (exigence 12), for the small avatar-stack UI in the page header.
   * Fire-and-forget friendly, same reasoning as `fetchReactions`/
   * `fetchSubscription` above.
   */
  fetchSubscribers = async () => {
    if (!this.id) return undefined;
    try {
      const subscribers = await this.services.subscription.listSubscribers();
      runInAction(() => {
        this.subscribers = subscribers;
      });
      return subscribers;
    } catch (error) {
      console.error("Error in fetching page subscribers", error);
      return undefined;
    }
  };
}
