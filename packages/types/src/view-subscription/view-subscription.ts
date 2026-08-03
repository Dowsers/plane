/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * A personal subscription to a saved view (project- or workspace-scoped -
 * both are the same `IssueView` model, see `IProjectView`/`IWorkspaceView`)
 * - see docs/feature-specs/04-views-filters.md ("Abonnements/notifications
 * par vue") in plane-selfhost. Mirrors `ViewSubscriptionSerializer`
 * (apps/api/plane/app/serializers/view.py), which is `fields = "__all__"`
 * on the `ViewSubscription` model plus a read-only `issue_view_name` field.
 */
export interface TViewSubscription {
  id: string;
  workspace: string;
  project: string | null;
  issue_view: string;
  issue_view_name: string;
  subscriber: string;
  notify_on_add: boolean;
  notify_on_complete: boolean;
  notify_on_cancel: boolean;
  notify_by_email: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * The only fields actually accepted by the create/update-or-create (POST)
 * and partial-update (PATCH) endpoints on `ViewSubscriptionViewSet` - every
 * other field on `TViewSubscription` is read-only (set by the server).
 */
export type TViewSubscriptionWritePayload = Partial<
  Pick<TViewSubscription, "notify_on_add" | "notify_on_complete" | "notify_on_cancel" | "notify_by_email">
>;

/**
 * Response envelope for `GET /workspaces/<slug>/users/me/view-subscriptions/`,
 * which paginates via `BaseAPIView.paginate` (apps/api/plane/utils/paginator.py)
 * - same cursor-pagination shape as `TNotificationPaginatedInfo`.
 */
export type TViewSubscriptionPaginatedInfo = {
  next_cursor: string | undefined;
  prev_cursor: string | undefined;
  next_page_results: boolean | undefined;
  prev_page_results: boolean | undefined;
  total_pages: number | undefined;
  extra_stats: string | undefined;
  count: number | undefined;
  total_count: number | undefined;
  results: TViewSubscription[] | undefined;
  grouped_by: string | undefined;
  sub_grouped_by: string | undefined;
};
