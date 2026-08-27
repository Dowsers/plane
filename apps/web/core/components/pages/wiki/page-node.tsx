/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { Briefcase } from "lucide-react";
import { createRoot } from "react-dom/client";
// plane imports
import { WikiIcon } from "@plane/propel/icons";
import type { InstructionType } from "@plane/types";
import { DragHandle, DropIndicator, FavoriteStar } from "@plane/ui";
import { cn, getPageName } from "@plane/utils";
// components
import { SwitcherIcon } from "@/components/common/switcher-label";
import { PageActions } from "@/components/pages/dropdowns";
// hooks
import { usePageOperations } from "@/hooks/use-page-operations";
// plane web hooks
import { EPageStoreType } from "@/plane-web/hooks/store";
// store
import type { TWorkspacePage } from "@/store/pages/workspace-page";
// local imports
import { MoveToProjectModal } from "./modals/move-to-project-modal";
import { getWikiCanDrop, getWikiInstructionFromPayload } from "./wiki-tree.helpers";
import type { TWikiDropTargetData } from "./wiki-tree.helpers";
import { useWikiDragAndDrop } from "./use-wiki-drag-drop";

type Props = {
  workspaceSlug: string;
  page: TWorkspacePage;
  isLastChild: boolean;
  level: number;
};

/** Exigence 3/5/9 - a leaf row in the Wiki tree: a top-level Wiki page (never a Collection). Draggable for reordering within its own container, and a drop target for the same. */
export const PageNode = observer(function PageNode(props: Props) {
  const { workspaceSlug, page, isLastChild, level } = props;
  // states
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  const [isMoveToProjectModalOpen, setIsMoveToProjectModalOpen] = useState(false);
  // refs
  const elementRef = useRef<HTMLDivElement | null>(null);
  // hooks
  const { handleDrop } = useWikiDragAndDrop(workspaceSlug);
  const { pageOperations } = usePageOperations({ page });
  // derived values
  const { id, name, logo_props, is_favorite, canCurrentUserFavoritePage, canCurrentUserEditPage } = page;

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !id) return;
    const initialData = { id, kind: "page" as const };

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
                  <WikiIcon className="size-4" />
                  <p className="truncate text-13 font-medium text-secondary">{getPageName(name)}</p>
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
        canDrop: ({ source }) => getWikiCanDrop(source, id),
        getData: ({ input, element: dropElement }) => {
          // A page can never contain children, and only the last row in a
          // container shows a "reorder-below" indicator (mirrors the
          // Favorites folder tree's own convention).
          const blocked: ("make-child" | "reparent" | "reorder-below")[] = ["make-child", "reparent"];
          if (!isLastChild) blocked.push("reorder-below");

          return attachInstruction({ id, kind: "page", isLastChild } satisfies TWikiDropTargetData, {
            input,
            element: dropElement,
            currentLevel: level,
            indentPerLevel: 16,
            mode: isLastChild ? "last-in-group" : "standard",
            block: blocked,
          });
        },
        onDrag: ({ source, self, location }) => {
          setInstruction(
            getWikiCanDrop(source, id) ? getWikiInstructionFromPayload(self, source, location) : undefined
          );
        },
        onDragLeave: () => setInstruction(undefined),
        onDrop: (payload) => {
          setInstruction(undefined);
          handleDrop(payload);
        },
      })
    );
  }, [id, isLastChild, level, handleDrop, name]);

  if (!id) return null;

  return (
    <div ref={elementRef} className={cn("relative", { "bg-layer-1 opacity-60": isDragging })}>
      <DropIndicator isVisible={instruction === "reorder-above"} />
      <MoveToProjectModal
        isOpen={isMoveToProjectModalOpen}
        onClose={() => setIsMoveToProjectModalOpen(false)}
        workspaceSlug={workspaceSlug}
        page={page}
      />
      <div
        className="group/wiki-page-item relative flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-primary hover:bg-layer-1-hover"
        style={{ paddingLeft: `${8 + level * 16}px` }}
      >
        <button
          type="button"
          className="hidden cursor-grab items-center justify-center text-placeholder group-hover/wiki-page-item:flex"
        >
          <DragHandle className="bg-transparent" />
        </button>
        <SwitcherIcon logo_props={logo_props} LabelIcon={WikiIcon} size={14} />
        <Link href={`/${workspaceSlug}/wiki/${id}`} className="flex-grow truncate text-13">
          {getPageName(name)}
        </Link>
        {canCurrentUserFavoritePage && (
          <FavoriteStar
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pageOperations.toggleFavorite();
            }}
            selected={is_favorite}
          />
        )}
        <PageActions
          page={page}
          storeType={EPageStoreType.WORKSPACE}
          optionsOrder={[
            "open-in-new-tab",
            "copy-link",
            "toggle-lock",
            "toggle-access",
            "save-as-template",
            "move-to-project",
            "archive-restore",
            "delete",
          ]}
          extraOptions={
            canCurrentUserEditPage
              ? [
                  {
                    key: "move-to-project",
                    action: () => setIsMoveToProjectModalOpen(true),
                    title: "Move to project",
                    icon: Briefcase,
                    shouldRender: true,
                  },
                ]
              : undefined
          }
        />
      </div>
      {isLastChild && <DropIndicator isVisible={instruction === "reorder-below"} />}
    </div>
  );
});
