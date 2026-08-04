/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// mobx store
import { StoreContext } from "@/lib/store-context";
// types
import type { ICustomDashboardStore } from "@/store/custom-dashboard.store";

/** Accessor for the custom cross-project dashboard builder store
 * (`rootStore.customDashboard`) - not to be confused with `useDashboard`
 * (`@/hooks/store/use-dashboard`), which accesses the unrelated legacy
 * per-user home-page-widget store (`rootStore.dashboard`). */
export const useCustomDashboard = (): ICustomDashboardStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useCustomDashboard must be used within StoreProvider");
  return context.customDashboard;
};
