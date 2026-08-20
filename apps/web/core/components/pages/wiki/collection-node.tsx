/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { Disclosure, Transition } from "@headlessui/react";
import { Folder, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { createRoot } from "react-dom/client";
// plane imports
import { ChevronRightIcon } from "@plane/propel/icons";
import type { InstructionType } from "@plane/types";
import { CustomMenu, DragHandle, DropIndicator } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { SwitcherIcon } from "@/components/common/switcher-label";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import { usePageCollectionStore, usePageStore, EPageStoreType } from "@/plane-web/hooks/store";
// local imports
import { WikiCreateMenu } from "./create-menu";
import { CreateCollectionModal } from "./modals/create-collection-modal";
import { DeleteCollectionModal } from "./modals/delete-collection-modal";
import { PageNode } from "./page-node";
import { useWikiDragAndDrop } from "./use-wiki-drag-drop";
import { getWikiCanDrop, getWikiInstructionFromPayload } from "./wiki-tree.helpers";
import type { TWikiDropTargetData } from "./wiki-tree.helpers";

type Props = {
  workspaceSlug: string;
  collectionId: string;
  level: number;
  isLastChild: boolean;
};

/** Exigence 2/3/5/7/9 - a Collection (folder) row, expandable/collapsible, holding sub-Collections and/or pages, recursively up to `WIKI_COLLECTION_MAX_DEPTH` levels. */
export const CollectionNode = observer(function CollectionNode(props: Props) {
  const { workspaceSlug, collectionId, level, isLastChild } = props;
  // states
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  const [isMenuActive, setIsMenuActive] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  // refs
  const elementRef = useRef<HTMLDivElement | null>(null);
  // router
  const router = useAppRouter();
  // hooks
  const { handleDrop } = useWikiDragAndDrop(workspaceSlug);
  // store hooks
  const { getCollectionById, getChildCollectionIds } = usePageCollectionStore();
  const { getActivePageIdsByCollection, getPageById } = usePageStore(EPageStoreType.WORKSPACE);
  // derived values
  const collection = getCollectionById(collectionId);
  const childCollectionIds = getChildCollectionIds(collectionId);
  const childPageIds = getActivePageIdsByCollection(collectionId);
  const isEmpty = childCollectionIds.length === 0 && childPageIds.length === 0;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const initialData = { id: collectionId, kind: "collection" as const };

    return combine(
      draggable({
        element,
        getInitialData: () => initialData,
        onDragStart: () => setIsDragging(true),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({ x: "0px", y: "0px" }),
            render: ({ container }) => {
              const root = createRoot(container);
              root.render(
                <div className="flex items-center gap-1 rounded-sm bg-surface-1 p-1 pr-2 text-13">
                  <Folder className="size-4" />
                  <p className="truncate text-13 font-medium text-secondary">{collection?.name}</p>
                </div>
              );
              return () => root.unmount();
            },
            nativeSetDragImage,
          });
        },
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => getWikiCanDrop(source, collectionId),
        getData: ({ input, element: dropElement }) => {
          const blocked: ("reorder-below" | "reparent")[] = ["reparent"];
          if (!isLastChild) blocked.push("reorder-below");

          return attachInstruction(
            { id: collectionId, kind: "collection", isLastChild } satisfies TWikiDropTargetData,
            {
              input,
              element: dropElement,
              currentLevel: level,
              indentPerLevel: 16,
              mode: isLastChild ? "last-in-group" : "standard",
              block: blocked,
            }
          );
        },
        onDrag: ({ source, self, location }) => {
          setInstruction(
            getWikiCanDrop(source, collectionId) ? getWikiInstructionFromPayload(self, source, location) : undefined
          );
        },
        onDragLeave: () => setInstruction(undefined),
        onDrop: (payload) => {
          setInstruction(undefined);
          handleDrop(payload);
        },
      })
    );
  }, [collectionId, isLastChild, level, handleDrop, collection?.name]);

  if (!collection) return null;

  return (
    <>
      <CreateCollectionModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        workspaceSlug={workspaceSlug}
        parentId={collection.parent}
        collectionToEdit={collection}
      />
      <DeleteCollectionModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        workspaceSlug={workspaceSlug}
        collection={collection}
        isEmpty={isEmpty}
      />
      <Disclosure defaultOpen={false}>
        {({ open }) => (
          <div
            ref={elementRef}
            className={cn("relative", {
              "bg-layer-1 opacity-60": isDragging,
              "border-[2px] border-accent-strong": instruction === "make-child",
            })}
          >
            <DropIndicator isVisible={instruction === "reorder-above"} />
            <div
              className={cn(
                "group/wiki-collection-item relative flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-primary hover:bg-layer-1-hover",
                { "bg-surface-2": isMenuActive }
              )}
              style={{ paddingLeft: `${8 + level * 16}px` }}
            >
              <button
                type="button"
                className="hidden cursor-grab items-center justify-center text-placeholder group-hover/wiki-collection-item:flex"
              >
                <DragHandle className="bg-transparent" />
              </button>
              <Disclosure.Button as="button" type="button" className="flex flex-grow items-center gap-1.5 text-left">
                <ChevronRightIcon
                  className={cn("size-3 flex-shrink-0 text-placeholder transition-transform", { "rotate-90": open })}
                />
                <SwitcherIcon logo_props={collection.logo_props} LabelIcon={Folder} size={14} />
                <span className="truncate text-13 font-medium">{collection.name}</span>
              </Disclosure.Button>
              <span className="opacity-0 group-hover/wiki-collection-item:opacity-100">
                <WikiCreateMenu
                  workspaceSlug={workspaceSlug}
                  collectionId={collectionId}
                  canCreate
                  onPageCreated={(pageId) => router.push(`/${workspaceSlug}/wiki/${pageId}`)}
                  variant="compact"
                />
              </span>
              <CustomMenu
                customButton={
                  <span className="grid place-items-center rounded-sm p-0.5 text-placeholder hover:bg-layer-1">
                    <MoreHorizontal className="size-3.5" />
                  </span>
                }
                menuButtonOnClick={() => setIsMenuActive(!isMenuActive)}
                onMenuClose={() => setIsMenuActive(false)}
                className={cn("flex-shrink-0 opacity-0 group-hover/wiki-collection-item:opacity-100", {
                  "opacity-100": isMenuActive,
                })}
                placement="bottom-end"
                closeOnSelect
              >
                <CustomMenu.MenuItem onClick={() => setIsRenameModalOpen(true)}>
                  <span className="flex items-center gap-2">
                    <PencilLine className="size-3.5" />
                    Rename folder
                  </span>
                </CustomMenu.MenuItem>
                <CustomMenu.MenuItem onClick={() => setIsDeleteModalOpen(true)}>
                  <span className="flex items-center gap-2 text-danger-primary">
                    <Trash2 className="size-3.5" />
                    Delete folder
                  </span>
                </CustomMenu.MenuItem>
              </CustomMenu>
            </div>
            <Transition
              enter="transition duration-100 ease-out"
              enterFrom="transform scale-95 opacity-0"
              enterTo="transform scale-100 opacity-100"
              leave="transition duration-75 ease-out"
              leaveFrom="transform scale-100 opacity-100"
              leaveTo="transform scale-95 opacity-0"
            >
              <Disclosure.Panel as="div" className="flex flex-col">
                {childCollectionIds.map((childId, index) => (
                  <CollectionNode
                    key={childId}
                    workspaceSlug={workspaceSlug}
                    collectionId={childId}
                    level={level + 1}
                    isLastChild={index === childCollectionIds.length - 1 && childPageIds.length === 0}
                  />
                ))}
                {childPageIds.map((pageId, index) => {
                  const page = getPageById(pageId);
                  if (!page) return null;
                  return (
                    <PageNode
                      key={pageId}
                      workspaceSlug={workspaceSlug}
                      page={page}
                      level={level + 1}
                      isLastChild={index === childPageIds.length - 1}
                    />
                  );
                })}
                {isEmpty && (
                  <p className="py-1.5 text-12 text-placeholder" style={{ paddingLeft: `${8 + (level + 1) * 16}px` }}>
                    No pages yet
                  </p>
                )}
              </Disclosure.Panel>
            </Transition>
            {isLastChild && <DropIndicator isVisible={instruction === "reorder-below"} />}
          </div>
        )}
      </Disclosure>
    </>
  );
});
