/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { WifiOff } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// hooks
import { useSyncEngine } from "@/hooks/store/use-sync-engine";

/**
 * Category 12, feature 4 - exigence 7's persistent "Hors ligne" banner,
 * shown app-wide (not scoped to one view) for as long as the outage
 * lasts. Only rendered when the workspace has the "Mode hors ligne
 * (beta)" rollout toggle on (`isFeatureEnabled`) - with the toggle off,
 * this feature stays entirely dormant and silent, matching every other
 * flag-gated feature in this fork.
 */
export const OfflineBanner = observer(function OfflineBanner() {
  const { t } = useTranslation();
  const { isFeatureEnabled, isOnline } = useSyncEngine();

  if (!isFeatureEnabled || isOnline) return null;

  return (
    <div
      role="status"
      className="flex w-full items-center justify-center gap-2 bg-warning-subtle px-4 py-1.5 text-13 font-medium text-warning-primary"
    >
      <WifiOff className="size-3.5 flex-shrink-0" />
      <span>{t("offline_sync.banner.offline")}</span>
    </div>
  );
});
