/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "../users";

/**
 * Category 10, feature 5 ("Abonnements/notifications par page") - mirrors
 * `PageSubscriberSerializer` (apps/api/plane/app/serializers/page.py), itself
 * calqued on `IssueSubscriber`'s own shape. Only the fields the frontend
 * actually consumes are typed here, same convention as `TPageReaction`/
 * `TPageComment` before it (the serializer itself is `fields = "__all__"`,
 * so more fields exist on the wire than are listed below).
 *
 * `PageActivity` (the `IssueActivity`-equivalent audit trail this same
 * feature introduced server-side) is deliberately NOT typed here - unlike
 * `PageSubscriber`, no viewset/serializer/URL exposes it anywhere yet (see
 * this feature's backend commit, `bd3e86442`), so there is no response
 * shape for a frontend type to describe.
 */
export type TPageSubscriber = {
  id: string;
  page: string;
  subscriber: string;
  subscriber_detail?: IUserLite;
  // Informational only - see the model's own docstring
  // (`plane.db.models.page_subscriber`) for why no UI in this feature
  // branches on either of these.
  subscribed_manually: boolean;
  unsubscribed_manually: boolean;
  workspace: string;
  created_at?: string;
};

/** Response body of `GET .../subscribe/` (exigence 12). */
export type TPageSubscriptionStatus = {
  subscribed: boolean;
};
