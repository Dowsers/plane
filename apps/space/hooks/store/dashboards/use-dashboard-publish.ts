/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// lib
import { StoreContext } from "@/lib/store-provider";
// store
import type { DashboardPublishStore } from "@/store/dashboards/dashboard-publish.store";

/**
 * Mirrors `usePublish` (`hooks/store/publish/use-publish.ts`) for the
 * equivalent project-publish flow. Deliberately returns `undefined` (rather
 * than that hook's `?? {}` fallback) while the anchor hasn't resolved yet,
 * so callers can gate their own loading state on a real presence check
 * (`!dashboard && !error`) instead of an always-truthy empty object.
 */
export const useDashboardPublish = (anchor: string): DashboardPublishStore | undefined => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useDashboardPublish must be used within StoreProvider");
  return context.dashboardPublishList.dashboardMap?.[anchor];
};
