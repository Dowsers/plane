/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { ChevronDown } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import { usePageCollectionStore, usePageStore, EPageStoreType } from "@/plane-web/hooks/store";
// local imports
import { WikiArchivedSection } from "./archived-section";
import { CollectionNode } from "./collection-node";
import { WikiCreateMenu } from "./create-menu";
import { WikiEmptyState } from "./empty-state";
import { PageNode } from "./page-node";
import { useWikiDragAndDrop } from "./use-wiki-drag-drop";

type Props = {
  workspaceSlug: string;
};

/**
 * Category 10, feature 4 ("Wiki workspace en GA") - the Wiki tree/list
 * view (exigence 2/3/5/6/9). Root Collections and root ("Sans dossier")
 * pages, plus a collapsible "Archived" section (exigence 6). Sub-pages
 * (a Page's own internal `parent` hierarchy) are deliberately out of
 * scope here - they stay reachable exactly as they are today, through the
 * page editor's own breadcrumb/switcher (see this feature's own research
 * notes on `WorkspacePageViewSet.get_queryset`'s `parent__isnull=True`).
 */
export const WikiTreeRoot = observer(function WikiTreeRoot(props: Props) {
  const { workspaceSlug } = props;
  // states
  const [isArchivedOpen, setIsArchivedOpen] = useState(false);
  const [instructionOnRoot, setInstructionOnRoot] = useState(false);
  // refs
  const rootDropRef = useRef<HTMLDivElement | null>(null);
  // router
  const router = useAppRouter();
  // hooks
  const { handleDropToRoot } = useWikiDragAndDrop(workspaceSlug);
  // store hooks
  const { getChildCollectionIds, canCurrentUserCreateRootCollection } = usePageCollectionStore();
  const { getActivePageIdsByCollection, getArchivedPageIds, getPageById, loader } = usePageStore(
    EPageStoreType.WORKSPACE
  );
  // derived values
  const rootCollectionIds = getChildCollectionIds(null);
  const rootPageIds = getActivePageIdsByCollection(null);
  const archivedPageIds = getArchivedPageIds();
  const isLoading = loader === "init-loader";
  const isEverythingEmpty = rootCollectionIds.length === 0 && rootPageIds.length === 0 && archivedPageIds.length === 0;

  useEffect(() => {
    const element = rootDropRef.current;
    if (!element) return;

    return dropTargetForElements({
      element,
      getData: () => ({ id: "__wiki_root__", kind: "root" }),
      onDragEnter: () => setInstructionOnRoot(true),
      onDragLeave: () => setInstructionOnRoot(false),
      onDrop: ({ source }) => {
        setInstructionOnRoot(false);
        handleDropToRoot(source);
      },
    });
  }, [handleDropToRoot]);

  if (!isLoading && isEverythingEmpty) {
    return (
      <WikiEmptyState
        workspaceSlug={workspaceSlug}
        canCreate={canCurrentUserCreateRootCollection}
        onPageCreated={(pageId) => router.push(`/${workspaceSlug}/wiki/${pageId}`)}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-2 px-page-x py-page-y">
      <div className="flex items-center justify-between">
        <h3 className="text-16 font-semibold text-primary">Wiki</h3>
        <WikiCreateMenu
          workspaceSlug={workspaceSlug}
          collectionId={null}
          canCreate={canCurrentUserCreateRootCollection}
          onPageCreated={(pageId) => router.push(`/${workspaceSlug}/wiki/${pageId}`)}
        />
      </div>
      <div
        ref={rootDropRef}
        className={cn("flex flex-col rounded-md", {
          "border-[2px] border-dashed border-accent-strong": instructionOnRoot,
        })}
      >
        {rootCollectionIds.map((collectionId, index) => (
          <CollectionNode
            key={collectionId}
            workspaceSlug={workspaceSlug}
            collectionId={collectionId}
            level={0}
            isLastChild={index === rootCollectionIds.length - 1 && rootPageIds.length === 0}
          />
        ))}

        {rootPageIds.length > 0 && (
          <>
            <div className="mt-2 flex items-center gap-1.5 px-2 py-1 text-11 font-medium text-placeholder">
              No folder
            </div>
            {rootPageIds.map((pageId, index) => {
              const page = getPageById(pageId);
              if (!page) return null;
              return (
                <PageNode
                  key={pageId}
                  workspaceSlug={workspaceSlug}
                  page={page}
                  level={0}
                  isLastChild={index === rootPageIds.length - 1}
                />
              );
            })}
          </>
        )}

        {rootCollectionIds.length === 0 && rootPageIds.length === 0 && (
          <p className="px-2 py-1.5 text-13 text-placeholder">No pages or folders yet.</p>
        )}
      </div>

      {archivedPageIds.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setIsArchivedOpen(!isArchivedOpen)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-13 font-medium text-tertiary hover:bg-layer-1-hover"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", { "-rotate-90": !isArchivedOpen })} />
            Archived ({archivedPageIds.length})
          </button>
          {isArchivedOpen && <WikiArchivedSection workspaceSlug={workspaceSlug} pageIds={archivedPageIds} />}
        </div>
      )}
    </div>
  );
});
