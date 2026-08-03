/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// mobx store
import { StoreContext } from "@/lib/store-context";
// types
import type { IViewSubscriptionStore } from "@/store/view-subscription.store";

export const useViewSubscription = (): IViewSubscriptionStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useViewSubscription must be used within StoreProvider");
  return context.viewSubscription;
};
