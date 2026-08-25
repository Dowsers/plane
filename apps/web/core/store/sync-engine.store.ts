/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import { API_BASE_URL } from "@plane/constants";
// lib
import { rootStore } from "@/lib/store-context";
import {
  buildCreateMutation,
  buildUpdateMutation,
  deleteWorkspaceDb,
  getEntity as getCachedEntity,
  listAllEntities as listAllCachedEntities,
  listCachedWorkspaceIds,
  listEntitiesByProject as listCachedEntitiesByProject,
} from "@plane/sync-engine";
import type {
  TCachedEntity,
  TMainToWorkerMessage,
  TMutableSyncEntity,
  TMutationQueueEntry,
  TSyncConflict,
  TSyncEntity,
  TWorkerToMainMessage,
} from "@plane/sync-engine";

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 4 - "Moteur de synchronisation local-first/
 * offline pour le web".
 *
 * The MobX-facing side of the sync engine - owns the dedicated Worker
 * (see `apps/web/core/workers/sync-engine.worker.ts`) for the CURRENT
 * workspace, the browser-side network monitor (exigence 6 -
 * `navigator.onLine` combined with a periodic heartbeat, since a VPN
 * drop or DNS black hole can leave `navigator.onLine` reporting `true`
 * while every real request still fails), and the observable state the
 * UI (the "Syncing (n)" indicator, the offline banner, the Power K
 * offline annotations) reads directly.
 *
 * Deliberately does NOT reroute the normal ONLINE mutation path through
 * this queue - `base-issues.store.ts`/`comment.store.ts`/`base-page.ts`
 * still call their existing `axios`-based services directly first, and
 * only fall back to `enqueue*` here from their OWN catch blocks, on a
 * genuine network-level failure (`isNetworkFailure`, see
 * `@plane/sync-engine`'s own docstring for why this is the safer,
 * lower-risk integration point than rerouting every mutation through an
 * async queue unconditionally - see this feature's own `README.md`).
 */

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;

export interface ISyncEngineStore {
  isOnline: boolean;
  isBooted: boolean;
  isFeatureEnabled: boolean;
  currentWorkspaceId: string | undefined;
  queueEntries: TMutationQueueEntry[];
  conflicts: TSyncConflict[];
  recentlyRemappedIds: Record<string, string>;

  pendingCount: number;
  failedEntries: TMutationQueueEntry[];

  bootForWorkspace: (workspace: { id: string; slug: string }, isFeatureEnabled: boolean) => void;
  leaveWorkspace: () => void;
  purgeOnSignOut: () => Promise<void>;

  enqueueCreateIssue: (params: {
    projectId: string;
    payload: Record<string, unknown>;
  }) => TMutationQueueEntry | undefined;
  enqueueUpdateIssue: (params: {
    projectId: string;
    issueId: string;
    payload: Record<string, unknown>;
    baseUpdatedAt?: string;
    baseFieldValues?: Record<string, unknown>;
    dependsOnClientId?: string;
  }) => TMutationQueueEntry | undefined;
  enqueueCreateComment: (params: {
    projectId: string;
    issueId: string;
    payload: Record<string, unknown>;
    dependsOnClientId?: string;
  }) => TMutationQueueEntry | undefined;
  enqueueUpdateComment: (params: {
    projectId: string;
    issueId: string;
    commentId: string;
    payload: Record<string, unknown>;
    baseUpdatedAt?: string;
    baseFieldValues?: Record<string, unknown>;
    dependsOnClientId?: string;
  }) => TMutationQueueEntry | undefined;
  enqueueUpdatePageMetadata: (params: {
    projectId?: string;
    pageId: string;
    payload: Record<string, unknown>;
    baseUpdatedAt?: string;
    baseFieldValues?: Record<string, unknown>;
  }) => TMutationQueueEntry | undefined;

  retryEntry: (id: string) => void;
  retryAllFailed: () => void;
  touchProject: (projectId: string) => void;

  /** Is `id` a client-generated id from a `create` mutation of this
   * entity type that hasn't synced yet - i.e. should a NEW mutation that
   * references `id` be marked `dependsOnClientId` (see `id-map.ts`) so
   * the worker defers it until the real server id is known, rather than
   * sending it immediately against an id the server has never heard of?
   * `false` for a real, already-synced server id - NOT the same as "this
   * id doesn't exist"; callers only ever check ids they already have in
   * hand from their own current state. */
  isPendingClientId: (entityType: TMutableSyncEntity, id: string) => boolean;

  getCachedEntityById: (entityType: TSyncEntity, id: string) => Promise<TCachedEntity | undefined>;
  getCachedEntitiesByProject: (entityType: TSyncEntity, projectId: string) => Promise<TCachedEntity[]>;
  getAllCachedEntities: (entityType: TSyncEntity) => Promise<TCachedEntity[]>;
}

export class SyncEngineStore implements ISyncEngineStore {
  isOnline = typeof navigator === "undefined" || navigator.onLine;
  isBooted = false;
  isFeatureEnabled = false;
  currentWorkspaceId: string | undefined = undefined;
  currentWorkspaceSlug: string | undefined = undefined;
  queueEntries: TMutationQueueEntry[] = [];
  conflicts: TSyncConflict[] = [];
  recentlyRemappedIds: Record<string, string> = {};

  private worker: Worker | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    makeObservable(this, {
      isOnline: observable,
      isBooted: observable,
      isFeatureEnabled: observable,
      currentWorkspaceId: observable,
      queueEntries: observable,
      conflicts: observable,
      recentlyRemappedIds: observable,
      bootForWorkspace: action,
      leaveWorkspace: action,
      setOnline: action,
      handleWorkerMessage: action,
    });

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleWindowOnline);
      window.addEventListener("offline", this.handleWindowOffline);
    }
  }

  get pendingCount(): number {
    return this.queueEntries.filter((entry) => entry.status !== "synced").length;
  }

  get failedEntries(): TMutationQueueEntry[] {
    return this.queueEntries.filter((entry) => entry.status === "failed");
  }

  bootForWorkspace(workspace: { id: string; slug: string }, isFeatureEnabled: boolean): void {
    if (this.currentWorkspaceId === workspace.id && this.isFeatureEnabled === isFeatureEnabled && this.worker) return;

    // Switching workspace (exigence 10) - purge the PREVIOUS workspace's
    // cache before booting the new one, never leave two workspaces'
    // caches alive in the same tab.
    const previousWorkspaceId = this.currentWorkspaceId;
    this.leaveWorkspace();
    if (previousWorkspaceId && previousWorkspaceId !== workspace.id) {
      void deleteWorkspaceDb(previousWorkspaceId);
    }

    this.currentWorkspaceId = workspace.id;
    this.currentWorkspaceSlug = workspace.slug;
    this.isFeatureEnabled = isFeatureEnabled;

    if (!isFeatureEnabled) return; // rollout toggle off - stay dormant, no worker, no IndexedDB writes

    this.worker = new Worker(new URL("../workers/sync-engine.worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event: MessageEvent<TWorkerToMainMessage>) =>
      this.handleWorkerMessage(event.data)
    );
    this.postToWorker({
      type: "init",
      config: { workspaceId: workspace.id, workspaceSlug: workspace.slug, apiBaseUrl: API_BASE_URL },
    });
    this.postToWorker({ type: "network-status", isOnline: this.isOnline });
    this.startHeartbeat();
  }

  leaveWorkspace(): void {
    this.postToWorker({ type: "destroy" });
    this.worker?.terminate();
    this.worker = undefined;
    this.stopHeartbeat();
    runInAction(() => {
      this.isBooted = false;
      this.queueEntries = [];
      this.conflicts = [];
      this.recentlyRemappedIds = {};
    });
  }

  /** Exigence 10 - full purge on logout/session-expiry, across every
   * workspace this browser profile has ever cached, not just the
   * currently active one. */
  async purgeOnSignOut(): Promise<void> {
    const workspaceIds = await listCachedWorkspaceIds();
    this.leaveWorkspace();
    await Promise.all(workspaceIds.map((id) => deleteWorkspaceDb(id)));
    runInAction(() => {
      this.currentWorkspaceId = undefined;
      this.currentWorkspaceSlug = undefined;
      this.isFeatureEnabled = false;
    });
  }

  enqueueCreateIssue(params: { projectId: string; payload: Record<string, unknown> }): TMutationQueueEntry | undefined {
    if (!this.currentWorkspaceId) return undefined;
    const entry = buildCreateMutation({
      workspaceId: this.currentWorkspaceId,
      entityType: "issue",
      projectId: params.projectId,
      payload: params.payload,
    });
    this.enqueue(entry);
    return entry;
  }

  enqueueUpdateIssue(params: {
    projectId: string;
    issueId: string;
    payload: Record<string, unknown>;
    baseUpdatedAt?: string;
    baseFieldValues?: Record<string, unknown>;
    dependsOnClientId?: string;
  }): TMutationQueueEntry | undefined {
    if (!this.currentWorkspaceId) return undefined;
    const entry = buildUpdateMutation({
      workspaceId: this.currentWorkspaceId,
      entityType: "issue",
      entityId: params.issueId,
      projectId: params.projectId,
      payload: params.payload,
      baseUpdatedAt: params.baseUpdatedAt,
      baseFieldValues: params.baseFieldValues,
      dependsOnClientId: params.dependsOnClientId,
    });
    this.enqueue(entry);
    return entry;
  }

  enqueueCreateComment(params: {
    projectId: string;
    issueId: string;
    payload: Record<string, unknown>;
    dependsOnClientId?: string;
  }): TMutationQueueEntry | undefined {
    if (!this.currentWorkspaceId) return undefined;
    const entry = buildCreateMutation({
      workspaceId: this.currentWorkspaceId,
      entityType: "issue_comment",
      projectId: params.projectId,
      issueId: params.issueId,
      payload: params.payload,
      dependsOnClientId: params.dependsOnClientId,
    });
    this.enqueue(entry);
    return entry;
  }

  enqueueUpdateComment(params: {
    projectId: string;
    issueId: string;
    commentId: string;
    payload: Record<string, unknown>;
    baseUpdatedAt?: string;
    baseFieldValues?: Record<string, unknown>;
    dependsOnClientId?: string;
  }): TMutationQueueEntry | undefined {
    if (!this.currentWorkspaceId) return undefined;
    const entry = buildUpdateMutation({
      workspaceId: this.currentWorkspaceId,
      entityType: "issue_comment",
      entityId: params.commentId,
      projectId: params.projectId,
      issueId: params.issueId,
      payload: params.payload,
      baseUpdatedAt: params.baseUpdatedAt,
      baseFieldValues: params.baseFieldValues,
      dependsOnClientId: params.dependsOnClientId,
    });
    this.enqueue(entry);
    return entry;
  }

  /** Page METADATA only (name/access/lock/parent/...) - the rich-text
   * body must never come through here, see this feature's own
   * `README.md` "Page body vs. LWW" section; `base-page.ts`'s `update`
   * only calls this for its own metadata `update()` path, never for
   * `updateDescription()`. */
  enqueueUpdatePageMetadata(params: {
    projectId?: string;
    pageId: string;
    payload: Record<string, unknown>;
    baseUpdatedAt?: string;
    baseFieldValues?: Record<string, unknown>;
  }): TMutationQueueEntry | undefined {
    if (!this.currentWorkspaceId) return undefined;
    const entry = buildUpdateMutation({
      workspaceId: this.currentWorkspaceId,
      entityType: "page",
      entityId: params.pageId,
      projectId: params.projectId,
      payload: params.payload,
      baseUpdatedAt: params.baseUpdatedAt,
      baseFieldValues: params.baseFieldValues,
    });
    this.enqueue(entry);
    return entry;
  }

  isPendingClientId(entityType: TMutableSyncEntity, id: string): boolean {
    return this.queueEntries.some(
      (entry) =>
        entry.entityType === entityType &&
        entry.operation === "create" &&
        entry.entityId === id &&
        entry.status !== "synced"
    );
  }

  retryEntry(id: string): void {
    this.postToWorker({ type: "retry-entry", id });
  }

  retryAllFailed(): void {
    this.postToWorker({ type: "retry-all-failed" });
  }

  touchProject(projectId: string): void {
    this.postToWorker({ type: "touch-project", projectId });
  }

  async getCachedEntityById(entityType: TSyncEntity, id: string): Promise<TCachedEntity | undefined> {
    if (!this.currentWorkspaceId) return undefined;
    const db = await this.openDbReadOnly();
    return db ? getCachedEntity(db, entityType, id) : undefined;
  }

  async getCachedEntitiesByProject(entityType: TSyncEntity, projectId: string): Promise<TCachedEntity[]> {
    if (!this.currentWorkspaceId) return [];
    const db = await this.openDbReadOnly();
    return db ? listCachedEntitiesByProject(db, entityType, projectId) : [];
  }

  async getAllCachedEntities(entityType: TSyncEntity): Promise<TCachedEntity[]> {
    if (!this.currentWorkspaceId) return [];
    const db = await this.openDbReadOnly();
    return db ? listAllCachedEntities(db, entityType) : [];
  }

  private async openDbReadOnly() {
    if (!this.currentWorkspaceId || !this.isFeatureEnabled) return undefined;
    const { openWorkspaceDb } = await import("@plane/sync-engine");
    return openWorkspaceDb(this.currentWorkspaceId);
  }

  private enqueue(entry: TMutationQueueEntry): void {
    this.postToWorker({ type: "enqueue", entry });
  }

  private postToWorker(message: TMainToWorkerMessage): void {
    this.worker?.postMessage(message);
  }

  handleWorkerMessage(message: TWorkerToMainMessage): void {
    switch (message.type) {
      case "ready":
        this.isBooted = true;
        break;
      case "queue-snapshot":
        this.queueEntries = message.entries;
        break;
      case "id-remapped":
        this.recentlyRemappedIds = { ...this.recentlyRemappedIds, [message.oldId]: message.newId };
        this.applyIdRemapToStores(message.entityType, message.oldId, message.newId);
        break;
      case "conflict":
        this.conflicts = [message.conflict, ...this.conflicts].slice(0, 20);
        // The toast half of exigence 9 is a dedicated bridge component
        // (`ConflictToastBridge`) reacting to `conflicts` above -
        // deliberately not fired from here (this codebase's stores never
        // call `setToast` directly, see that component's own docstring).
        break;
      case "delta-applied":
        this.applyDeltaToStores(message.entities);
        break;
      case "accessible-ids-purged":
        this.applyAccessiblePurgeToStores(message.entityType, message.removedIds);
        break;
      case "error":
        // Logged by the browser's own console via the worker's own
        // uncaught-rejection surface already - nothing this feature's 13
        // exigences call for surfacing to the end user for a background
        // pull failure specifically (as opposed to a queued MUTATION
        // failure, which the "Syncing" panel already covers via
        // `failedEntries`).
        break;
      default:
        break;
    }
  }

  /**
   * Category 12, feature 4 - the MobX side of exigence 7's "already-
   * loaded views stay readable offline": mirrors the worker's periodic
   * delta-pull results into the SAME root stores every existing view
   * already reads from (`IssueStore.addIssue`, the comment/cycle/module/
   * label/state stores' new additive `mergeFromSync` methods - see each
   * one's own docstring), so a view that re-renders from already-in-
   * memory MobX state stays current WITHOUT needing to itself re-fetch
   * (which would fail outright while offline). This is in addition to,
   * not instead of, the IndexedDB write-through the worker already did
   * before sending this message - IndexedDB is what survives a hard
   * page reload while offline; this is what keeps the CURRENT tab's
   * already-rendered UI current without one.
   */
  private applyDeltaToStores(entities: Extract<TWorkerToMainMessage, { type: "delta-applied" }>["entities"]): void {
    if (entities.issue) rootStore.issue.issues.addIssue(entities.issue as never);
    if (entities.issue_comment) rootStore.issue.issueDetail.comment.mergeFromSync(entities.issue_comment);
    if (entities.cycle) rootStore.cycle.mergeFromSync(entities.cycle);
    if (entities.module) rootStore.module.mergeFromSync(entities.module);
    if (entities.label) rootStore.label.mergeFromSync(entities.label);
    if (entities.state) rootStore.state.mergeFromSync(entities.state);
    // `page` metadata deliberately has no MobX hydration path here - see
    // `README.md`'s "Known scope limits" section for why (existing
    // `BasePage` instances aren't a flat id-keyed map like the others,
    // and the rich-text body this feature must never touch is already
    // covered by the pre-existing Yjs/y-indexeddb path regardless).
  }

  /** The MobX side of exigence 11's access-revocation reconciliation -
   * scoped to `issue` only (the one case where leaving a now-
   * inaccessible record visible in-memory is a real, user-facing
   * confidentiality concern, not just harmless staleness) - see
   * `README.md`'s "Known scope limits" section for why
   * `issue_comment`/the reference entities rely on the IndexedDB-level
   * purge (`purgeInaccessible`, already applied before this message was
   * even sent) plus the natural staleness bound of a page reload,
   * rather than also being wired into every one of their own MobX
   * stores here. */
  private applyAccessiblePurgeToStores(entityType: TSyncEntity, removedIds: string[]): void {
    if (entityType !== "issue") return;
    removedIds.forEach((id) => rootStore.issue.issues.removeIssue(id));
  }

  /** Exigence 3's dependency reconciliation, MobX side: once a client-
   * generated id resolves to a real server id, ADD a record under the
   * new id (from the cache the worker itself just upserted) so anything
   * that already knows the real id resolves correctly - deliberately
   * does NOT remove the old client-id entry (see `README.md`'s "Known
   * scope limits" section: a view's own ordered id list - kanban/list/
   * grouped ids, tracked independently per view-type store - may still
   * reference the OLD id for the remainder of this browser session; a
   * live rename across every one of those list structures is a larger,
   * separate change than this session's scope, and leaving the stale
   * entry in place is the lower-risk direction - a card staying visible
   * under its old id is a far smaller issue than one disappearing). */
  private applyIdRemapToStores(entityType: string, oldId: string, newId: string): void {
    if (entityType === "issue") {
      const oldIssue = rootStore.issue.issues.getIssueById(oldId);
      if (oldIssue) rootStore.issue.issues.addIssue([{ ...oldIssue, id: newId }]);
    } else if (entityType === "issue_comment") {
      const oldComment = rootStore.issue.issueDetail.comment.getCommentById(oldId);
      if (oldComment) rootStore.issue.issueDetail.comment.mergeFromSync([{ ...oldComment, id: newId }]);
    }
  }

  private handleWindowOnline = (): void => {
    this.setOnline(true);
  };

  private handleWindowOffline = (): void => {
    this.setOnline(false);
  };

  setOnline(isOnline: boolean): void {
    if (this.isOnline === isOnline) return;
    this.isOnline = isOnline;
    this.postToWorker({ type: "network-status", isOnline });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    void this.runHeartbeat();
    this.heartbeatTimer = setInterval(() => void this.runHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  /** Exigence 6 - `navigator.onLine` alone only tells you the network
   * INTERFACE is up, not that the API is actually reachable (a VPN drop
   * or a captive portal both leave it `true`). This periodic ping is the
   * other half of the signal - reuses the existing, already-fetched-on-
   * every-app-boot `GET /api/instances/` endpoint (no new endpoint added
   * for this, see `README.md`) purely as a reachability probe; the
   * response body/status is irrelevant, only "did the request complete
   * at all" matters. */
  private async runHeartbeat(): Promise<void> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.setOnline(false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
      await fetch(`${API_BASE_URL}/api/instances/`, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      this.setOnline(true);
    } catch {
      this.setOnline(false);
    }
  }
}
