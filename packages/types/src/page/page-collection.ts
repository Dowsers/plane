/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

// Category 10, feature 4 ("Wiki workspace en GA") - mirrors
// `PageCollectionSerializer` (apps/api/plane/app/serializers/page.py). A
// folder used to organize workspace-level Wiki pages into a nested tree
// (max depth 3, enforced server-side and mirrored client-side - see
// `plane.utils.page_collection` on the backend).
export type TPageCollection = {
  id: string;
  workspace: string;
  parent: string | null;
  name: string;
  logo_props: TLogoProps | undefined;
  sort_order: number;
  created_at: Date | undefined;
  updated_at: Date | undefined;
  created_by: string | undefined;
  updated_by: string | undefined;
};

export type TPageCollectionReorderPayload = {
  after_id: string | null;
  // The new parent Collection id (or null for the Wiki root) - named
  // `collection_id` to match the exact payload key the backend's
  // `WorkspacePageCollectionViewSet.reorder` expects (kept identical to the
  // Page reorder payload shape below on purpose, per the backend's own
  // docstring).
  collection_id: string | null;
};

export type TPageReorderPayload = {
  after_id: string | null;
  collection_id: string | null;
};

export type TPageConvertTarget = "global" | "project";

export type TPageConvertPayload = {
  target: TPageConvertTarget;
  project_id?: string | null;
};
