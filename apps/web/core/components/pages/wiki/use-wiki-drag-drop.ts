/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPragmaticDropPayload, TDropTarget } from "@plane/types";
// plane web hooks
import { EPageStoreType, usePageCollectionStore, usePageStore } from "@/plane-web/hooks/store";
// store
import { WIKI_COLLECTION_MAX_DEPTH } from "@/store/pages/page-collection.store";
// local imports
import type { TWikiDragData, TWikiDropTargetData } from "./wiki-tree.helpers";
import { getWikiInstructionFromPayload } from "./wiki-tree.helpers";

/**
 * Category 10, feature 4 ("Wiki workspace en GA") exigence 9 - a single
 * shared drop handler used identically by every `CollectionNode`/
 * `PageNode` row's `dropTargetForElements.onDrop`. Centralizing this
 * (rather than threading pre-computed sibling lists down through props)
 * keeps every row's DnD wiring simple: at drop time, it looks up the
 * target's *current* container/siblings fresh from the store, so it works
 * identically regardless of which row initiated the drop.
 */
export const useWikiDragAndDrop = (workspaceSlug: string) => {
  const { getPageById, reorderPage, getActivePageIdsByCollection } = usePageStore(EPageStoreType.WORKSPACE);
  const {
    getCollectionById,
    getChildCollectionIds,
    getCollectionDepth,
    getDescendantCollectionIds,
    reorderCollection,
  } = usePageCollectionStore();

  const handleDrop = useCallback(
    async ({ self, source, location }: IPragmaticDropPayload) => {
      const instruction = getWikiInstructionFromPayload(self, source, location);
      if (!instruction || instruction === "instruction-blocked") return;

      const sourceData = source?.data as TWikiDragData | undefined;
      const targetData = self?.data as TWikiDropTargetData | undefined;
      if (!sourceData || !targetData || sourceData.id === targetData.id) return;

      try {
        if (instruction === "make-child") {
          if (targetData.kind !== "collection") return;
          const targetCollectionId = targetData.id;

          if (sourceData.kind === "collection") {
            if (getDescendantCollectionIds(sourceData.id).includes(targetCollectionId)) {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: "Error!",
                message: "A folder cannot be moved under one of its own sub-folders.",
              });
              return;
            }
            if (getCollectionDepth(targetCollectionId) >= WIKI_COLLECTION_MAX_DEPTH) {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: "Error!",
                message: "Folders can only be nested 3 levels deep.",
              });
              return;
            }
            const siblingIds = getChildCollectionIds(targetCollectionId);
            const afterId = siblingIds.length ? siblingIds[siblingIds.length - 1] : null;
            await reorderCollection(workspaceSlug, sourceData.id, afterId, targetCollectionId);
          } else {
            const siblingIds = getActivePageIdsByCollection(targetCollectionId);
            const afterId = siblingIds.length ? siblingIds[siblingIds.length - 1] : null;
            await reorderPage(workspaceSlug, sourceData.id, afterId, targetCollectionId);
          }
          return;
        }

        // reorder-above / reorder-below are only meaningful between two
        // items of the same kind (Collections and pages live in
        // independent `sort_order` sequences even within the same
        // container - see `WIKI_COLLECTION_MAX_DEPTH`'s sibling doc).
        if (sourceData.kind !== targetData.kind) return;

        if (sourceData.kind === "collection") {
          if (getDescendantCollectionIds(sourceData.id).includes(targetData.id)) return;
          const targetCollection = getCollectionById(targetData.id);
          if (!targetCollection) return;
          const parentId = targetCollection.parent;
          const siblingIds = getChildCollectionIds(parentId);
          const targetIndex = siblingIds.indexOf(targetData.id);
          const afterId =
            instruction === "reorder-below" ? targetData.id : targetIndex > 0 ? siblingIds[targetIndex - 1] : null;
          await reorderCollection(workspaceSlug, sourceData.id, afterId, parentId);
        } else {
          const targetPage = getPageById(targetData.id);
          if (!targetPage) return;
          const collectionId = targetPage.collection_id ?? null;
          const siblingIds = getActivePageIdsByCollection(collectionId);
          const targetIndex = siblingIds.indexOf(targetData.id);
          const afterId =
            instruction === "reorder-below" ? targetData.id : targetIndex > 0 ? siblingIds[targetIndex - 1] : null;
          await reorderPage(workspaceSlug, sourceData.id, afterId, collectionId);
        }
      } catch (error: any) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: error?.error || "The page could not be moved. Please try again.",
        });
      }
    },
    [
      getPageById,
      reorderPage,
      getActivePageIdsByCollection,
      getCollectionById,
      getChildCollectionIds,
      getCollectionDepth,
      getDescendantCollectionIds,
      reorderCollection,
      workspaceSlug,
    ]
  );

  /** Dropping onto the Wiki root drop zone ("Sans dossier") - moves the dragged item to the workspace root (`collection_id`/`parent = null`). */
  const handleDropToRoot = useCallback(
    async (source: TDropTarget) => {
      const sourceData = source?.data as TWikiDragData | undefined;
      if (!sourceData) return;

      try {
        if (sourceData.kind === "collection") {
          const siblingIds = getChildCollectionIds(null);
          const afterId = siblingIds.length ? siblingIds[siblingIds.length - 1] : null;
          await reorderCollection(workspaceSlug, sourceData.id, afterId, null);
        } else {
          const siblingIds = getActivePageIdsByCollection(null);
          const afterId = siblingIds.length ? siblingIds[siblingIds.length - 1] : null;
          await reorderPage(workspaceSlug, sourceData.id, afterId, null);
        }
      } catch (error: any) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: error?.error || "The page could not be moved. Please try again.",
        });
      }
    },
    [getChildCollectionIds, reorderCollection, getActivePageIdsByCollection, reorderPage, workspaceSlug]
  );

  return { handleDrop, handleDropToRoot };
};
