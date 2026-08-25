/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useSyncEngine } from "@/hooks/store/use-sync-engine";

/**
 * Category 12, feature 4 - exigence 9's "l'utilisateur en est notifie
 * explicitement (toast + entree dans le panneau de sync) plutot qu'un
 * ecrasement silencieux". The sync panel half already reads
 * `syncEngine.conflicts` directly (see `sync-indicator.tsx`); this
 * side-effect-only component (renders nothing) is the toast half -
 * mounted once, diffs `conflicts` against what it's already shown a
 * toast for, and fires one per NEW conflict. A plain `useEffect` diff
 * rather than calling `setToast` straight from the MobX store itself,
 * matching this codebase's own convention (no store in this fork calls
 * `setToast` directly - always from the React layer).
 */
export const ConflictToastBridge = observer(function ConflictToastBridge() {
  const { t } = useTranslation();
  const { conflicts } = useSyncEngine();
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    for (const conflict of conflicts) {
      if (seenIds.current.has(conflict.id)) continue;
      seenIds.current.add(conflict.id);
      setToast({
        type: TOAST_TYPE.WARNING,
        title: t("offline_sync.conflict.toast_title"),
        message: t("offline_sync.conflict.toast_description", {
          field: conflict.field,
          entity: conflict.entityType,
        }),
      });
    }
  }, [conflicts, t]);

  return null;
});
