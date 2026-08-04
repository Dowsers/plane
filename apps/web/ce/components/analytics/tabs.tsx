/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { AnalyticsTab } from "@plane/types";
import { Durations } from "@/components/analytics/durations";
import { Overview } from "@/components/analytics/overview";
import { Velocity } from "@/components/analytics/velocity";
import { WorkItems } from "@/components/analytics/work-items";

export const getAnalyticsTabs = (t: (key: string, params?: Record<string, any>) => string): AnalyticsTab[] => [
  { key: "overview", label: t("common.overview"), content: Overview, isDisabled: false },
  { key: "work-items", label: t("sidebar.work_items"), content: WorkItems, isDisabled: false },
  { key: "velocity", label: t("workspace_analytics.velocity"), content: Velocity, isDisabled: false },
  { key: "durations", label: t("workspace_analytics.durations"), content: Durations, isDisabled: false },
];
