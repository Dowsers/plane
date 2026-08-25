/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// hooks
import { useSyncEngine } from "@/hooks/store/use-sync-engine";
import { useWorkspace } from "@/hooks/store/use-workspace";
import useReloadConfirmations from "@/hooks/use-reload-confirmation";

/**
 * Category 12, feature 4 - boots (or tears down/switches) the sync
 * engine's Worker for the active workspace. Purely a side-effect
 * component (renders nothing) - mounted once in `WorkspaceContentWrapper`
 * so it lives for exactly as long as the user is anywhere inside a given
 * workspace (exigence 10's "workspace switch" boundary - see
 * `SyncEngineStore.bootForWorkspace`'s own purge-on-switch handling),
 * regardless of which page within it is open.
 */
export const SyncEngineProvider = observer(function SyncEngineProvider() {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const syncEngine = useSyncEngine();
  // Exigence 14 - standard browser `beforeunload` warning while
  // `mutation_queue` still holds non-synced entries, reusing this fork's
  // existing generic reload-confirmation hook (already used elsewhere
  // for unsaved-editor-state warnings) rather than adding a second,
  // competing `beforeunload` listener.
  const { setShowAlert } = useReloadConfirmations(syncEngine.isFeatureEnabled, t("offline_sync.unload_warning"));

  useEffect(() => {
    setShowAlert(syncEngine.pendingCount > 0);
  }, [setShowAlert, syncEngine.pendingCount]);

  useEffect(() => {
    if (!currentWorkspace?.id || !currentWorkspace.slug) return;
    syncEngine.bootForWorkspace(
      { id: currentWorkspace.id, slug: currentWorkspace.slug },
      Boolean(currentWorkspace.is_offline_sync_enabled)
    );
    // Deliberately no cleanup/`leaveWorkspace()` on unmount here - this
    // component's lifetime already tracks "am I still somewhere inside
    // this workspace" (see docstring above); tearing down on every
    // unmount would defeat the whole point of the cache surviving
    // navigation within the SAME workspace. `bootForWorkspace` itself
    // handles switching to a DIFFERENT workspace id (purging the
    // previous one) and sign-out is handled separately by
    // `CoreRootStore.resetOnSignOut` -> `syncEngine.purgeOnSignOut()`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id, currentWorkspace?.slug, currentWorkspace?.is_offline_sync_enabled]);

  return null;
});
